import { randomBytes } from "node:crypto";

import type { CredentialAcquisition, CredentialRef, CredentialValue } from "@hypit/runtime";

/**
 * Which entry point produced the stored key. Both entries end at the same ordinary OrcaRouter API
 * key, so nothing downstream of `token()` may branch on this; it exists so status, logout and error
 * messages can name the route the user chose.
 */
export type OrcaRouterCredentialSource = "api-key" | "oauth";

/** `needsReauth` is terminal: the relay rejected this exact credential and only a new login clears it. */
export type OrcaRouterCredentialState = "ready" | "needsReauth";

/**
 * The credential envelope this Provider stores in the Endpoint's own credential slot. A bare
 * `sk-orca-…` string is also accepted, so a user who pasted a key before this envelope existed is
 * not forced to re-enter it.
 */
type StoredEnvelope = {
  readonly format: "hypit.orcarouter-credential@1";
  readonly key: string;
  readonly generation: number;
  readonly state: OrcaRouterCredentialState;
  readonly issuedVia: OrcaRouterCredentialSource;
};

export type StoredOrcaRouterCredential = {
  readonly key: string;
  readonly generation: number;
  readonly state: OrcaRouterCredentialState;
  readonly issuedVia: OrcaRouterCredentialSource;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** A pasted key is a static credential: generation 0 of the slot, and never reissued automatically. */
export function decodeOrcaRouterCredential(secret: string): StoredOrcaRouterCredential | undefined {
  const trimmed = secret.trim();
  if (trimmed.length === 0) return undefined;
  if (!trimmed.startsWith("{")) return { key: trimmed, generation: 0, state: "ready", issuedVia: "api-key" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const value = parsed as Partial<StoredEnvelope>;
  if (value.format !== "hypit.orcarouter-credential@1") return undefined;
  if (typeof value.key !== "string" || value.key.trim().length === 0) return undefined;
  if (typeof value.generation !== "number" || !Number.isSafeInteger(value.generation) || value.generation < 0) return undefined;
  assert(value.state === "ready" || value.state === "needsReauth", "OrcaRouter credential state is invalid");
  assert(value.issuedVia === "api-key" || value.issuedVia === "oauth", "OrcaRouter credential source is invalid");
  return { key: value.key.trim(), generation: value.generation, state: value.state, issuedVia: value.issuedVia };
}

export function encodeOrcaRouterCredential(value: StoredOrcaRouterCredential): string {
  assert(value.key.trim().length > 0, "OrcaRouter credential key is empty");
  assert(Number.isSafeInteger(value.generation) && value.generation >= 0, "OrcaRouter credential generation is invalid");
  return JSON.stringify({ format: "hypit.orcarouter-credential@1", ...value } satisfies StoredEnvelope);
}

/**
 * Which generation of a slot is current, per CredentialRef. A late `401` from a request made with
 * generation N must not mark the credential a fresh login just stored as generation N+1.
 */
const generations = new Map<string, number>();

function refKey(ref: CredentialRef): string {
  return `${ref.store}\u0000${ref.key}`;
}

export function currentCredentialGeneration(ref: CredentialRef): number {
  return generations.get(refKey(ref)) ?? 0;
}

/** Called by the login routes when they store a credential; returns the new generation. */
export function advanceCredentialGeneration(ref: CredentialRef): number {
  const next = currentCredentialGeneration(ref) + 1;
  generations.set(refKey(ref), next);
  return next;
}

/** Test seam: forget the in-process generation counters. */
export function resetCredentialGenerations(): void {
  generations.clear();
}

export type OrcaRouterCredential = {
  readonly source: OrcaRouterCredentialSource;
  readonly generation: number;
  /** The Bearer value for one inference or catalogue request. */
  token(): Promise<string>;
  status(): OrcaRouterCredentialState;
  /**
   * Terminal reauthentication for the exact credential that made a rejected request. Returns the
   * state after the attempt; it does nothing when a newer login has already replaced this credential.
   */
  reject(): Promise<OrcaRouterCredentialState>;
};

export type OrcaRouterCredentialAdapter = {
  readonly id: "orcarouter" | "orcarouter-oauth";
  readonly label: string;
  /** Read the credential this entry point stored, or undefined when the user has not used it. */
  resolve(): Promise<OrcaRouterCredential | undefined>;
};

/** Both entry points produce this one credential; only `source` records how the key arrived. */
export function createOrcaRouterCredential(options: {
  readonly secret: string;
  readonly ref: CredentialRef;
  readonly replace?: (value: CredentialValue) => Promise<void>;
}): OrcaRouterCredential | undefined {
  const decoded = decodeOrcaRouterCredential(options.secret);
  if (decoded === undefined) return undefined;
  // A credential restored from storage is the current one until a login replaces it, so open it at
  // its own generation; a `needsReauth` marker recorded earlier stays authoritative.
  const generation = Math.max(decoded.generation, currentCredentialGeneration(options.ref));
  generations.set(refKey(options.ref), generation);
  let state = decoded.state;
  return {
    source: decoded.issuedVia,
    generation,
    async token() {
      // There is no refresh grant: a durable OrcaRouter key is reused until the user revokes it.
      assert(state === "ready", "OrcaRouter credential needs authorization; run hypit auth login orcarouter.default");
      return decoded.key;
    },
    status: () => state,
    async reject() {
      // A late failure from a replaced credential must not touch the newer one.
      if (currentCredentialGeneration(options.ref) !== generation) return state;
      state = "needsReauth";
      await options.replace?.({
        secret: encodeOrcaRouterCredential({
          key: decoded.key,
          generation,
          state: "needsReauth",
          issuedVia: decoded.issuedVia,
        }),
      });
      return state;
    },
  };
}

/** Store one freshly obtained key as a new generation of the slot. */
export async function storeOrcaRouterCredential(options: {
  readonly ref: CredentialRef;
  readonly replace: (value: CredentialValue) => Promise<void>;
  readonly key: string;
  readonly issuedVia: OrcaRouterCredentialSource;
}): Promise<StoredOrcaRouterCredential> {
  assert(options.key.trim().length > 0, "OrcaRouter returned an empty key");
  const generation = advanceCredentialGeneration(options.ref);
  const stored = { key: options.key.trim(), generation, state: "ready" as const, issuedVia: options.issuedVia };
  await options.replace({ secret: encodeOrcaRouterCredential(stored) });
  return stored;
}

/**
 * The API-key entry point: a key the user already holds. It reads the same slot as the account-login
 * adapter and produces the same credential type, and it resolves only a key that arrived this way.
 */
export function apiKeyCredentialAdapter(options: {
  readonly secret: string;
  readonly ref: CredentialRef;
  readonly replace?: (value: CredentialValue) => Promise<void>;
  readonly label?: string;
}): OrcaRouterCredentialAdapter {
  return {
    id: "orcarouter",
    label: options.label ?? "OrcaRouter - API",
    async resolve() {
      const decoded = decodeOrcaRouterCredential(options.secret);
      if (decoded === undefined || decoded.issuedVia !== "api-key") return undefined;
      return createOrcaRouterCredential(options);
    },
  };
}

/**
 * The account-login entry point. The key it reads was minted by the authorization flow; it is
 * indistinguishable downstream of `token()`, and it resolves only a key that arrived this way.
 */
export function pkceCredentialAdapter(options: {
  readonly secret: string;
  readonly ref: CredentialRef;
  readonly replace?: (value: CredentialValue) => Promise<void>;
  readonly label?: string;
}): OrcaRouterCredentialAdapter {
  return {
    id: "orcarouter-oauth",
    label: options.label ?? "OrcaRouter - Auth",
    async resolve() {
      const decoded = decodeOrcaRouterCredential(options.secret);
      if (decoded === undefined || decoded.issuedVia !== "oauth") return undefined;
      return createOrcaRouterCredential(options);
    },
  };
}

export const ORCAROUTER_APP_NAME = "Hypit";
export const ORCAROUTER_KEY_DASHBOARD = "https://www.orcarouter.ai/console/authorized-apps";

/**
 * The authorization this Provider declares to the host. The consent endpoint takes no redirect, so
 * the code is displayed and pasted back; S256 is therefore mandatory and the exchange sends it
 * explicitly. The exchange returns a durable key rather than a refreshable token pair, so the
 * credential is stored as an ordinary secret.
 */
export function orcaRouterAcquisition(options: {
  readonly authBaseUrl?: string;
  readonly requestTimeoutMs?: number;
} = {}): CredentialAcquisition {
  const authBase = (options.authBaseUrl ?? "https://www.orcarouter.ai").replace(/\/+$/u, "");
  assert(/^https:\/\//u.test(authBase) || /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/u.test(authBase),
    "OrcaRouter auth base must use HTTPS, or HTTP on loopback");
  return {
    kind: "oauth2-pkce",
    authorizationEndpoint: `${authBase}/auth`,
    // The relay is at /v1; authentication is not. /v1/auth/keys is a 404.
    tokenEndpoint: `${authBase}/api/v1/auth/keys`,
    clientId: "",
    scopes: ["api"],
    requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
    delivery: "out-of-band",
    authorizeParams: {
      callback_url: "oob",
      app_name: ORCAROUTER_APP_NAME,
      scope: "api",
    },
    exchange: {
      encoding: "json",
      fields: { code_challenge_method: "S256" },
      credentialField: "key",
      credentialFormat: "opaque",
      requiredScope: "api",
    },
  };
}

/** A fresh PKCE verifier. Cryptographic randomness, never derived from anything guessable. */
export function pkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}
