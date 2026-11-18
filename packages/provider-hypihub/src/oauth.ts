import { createHash, randomBytes } from "node:crypto";
import { hypiHubBaseUrl, type HypiHubCredentialSource } from "./authentication.js";

const CLIENT_ID = "hyc_d5d5e8e7131b0c877756e66c";
// HypiHub's inference scope implies the modality scopes and user:jobs.
const SCOPES = ["user:profile", "user:inference"];
const REFRESH_SKEW_MS = 60_000;

export type HypiHubOAuthRecord = {
  readonly origin: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly refreshExpiresAt?: number;
  readonly rotationPending?: true;
};

/** One credential slot. The lock covers read, remote rotation and durable replacement. */
export type HypiHubOAuthStore = {
  read(): Promise<HypiHubOAuthRecord | undefined>;
  write(value: HypiHubOAuthRecord): Promise<void>;
  remove(): Promise<void>;
  withLock<T>(operation: () => Promise<T>): Promise<T>;
};

export type HypiHubOAuthStatus =
  | { readonly status: "disconnected" }
  | { readonly status: "connected" | "needs-refresh" | "reconnect"; readonly expiresAt: number;
      readonly refreshExpiresAt?: number };

export type HypiHubOAuthAttempt = {
  readonly authorizationUrl: string;
  readonly callbackOrigin: string;
  readonly expiresAt: number;
  acceptsState(state: string | null): boolean;
  complete(result: { readonly state: string; readonly code?: string; readonly error?: string }, signal?: AbortSignal): Promise<HypiHubOAuthStatus>;
  cancel(): void;
};

export type HypiHubOAuthConnection = HypiHubCredentialSource & {
  inspectAccess: NonNullable<HypiHubCredentialSource["inspectAccess"]>;
  beginAuthorization(options?: { readonly callbackPort?: number; readonly timeoutMs?: number }): HypiHubOAuthAttempt;
  status(): Promise<HypiHubOAuthStatus>;
  disconnect(): Promise<void>;
};

export class HypiHubOAuthError extends Error {
  constructor(readonly code: "hypihub-authorization-required" | "hypihub-oauth-unavailable" | "hypihub-oauth-rejected",
    message: string) { super(message); }
}

function reconnect(): HypiHubOAuthError {
  return new HypiHubOAuthError("hypihub-authorization-required", "Connect the HypiHub account again to continue.");
}

function duration(value: number, subject: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new Error(`Invalid HypiHub ${subject}.`);
  }
  return value;
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function token(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._~+/-]+=*$/u.test(value);
}

function fields(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid HypiHub OAuth record.");
  }
  return value as Record<string, unknown>;
}

export function readHypiHubOAuthRecord(value: unknown): HypiHubOAuthRecord {
  const { origin, accessToken, refreshToken, expiresAt, refreshExpiresAt, rotationPending } = fields(value);
  if (typeof origin !== "string" || hypiHubBaseUrl(origin).origin !== origin || !token(accessToken) || !token(refreshToken)
    || !timestamp(expiresAt) || (refreshExpiresAt !== undefined && !timestamp(refreshExpiresAt))
    || (rotationPending !== undefined && rotationPending !== true)) {
    throw new Error("Invalid HypiHub OAuth record.");
  }
  return { origin, accessToken, refreshToken, expiresAt,
    ...(refreshExpiresAt === undefined ? {} : { refreshExpiresAt }),
    ...(rotationPending === undefined ? {} : { rotationPending }) };
}

export function createHypiHubOAuthConnection(options: {
  readonly id: string;
  readonly store: HypiHubOAuthStore;
  readonly baseUrl?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly requestTimeoutMs?: number;
}): HypiHubOAuthConnection {
  const origin = hypiHubBaseUrl(options.baseUrl).origin;
  const redirectUri = new URL("/oauth/callback", origin).href;
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeout = duration(options.requestTimeoutMs ?? 30_000, "OAuth request timeout");
  const { store } = options;
  let active: HypiHubOAuthAttempt | undefined;
  let refreshing: Promise<string> | undefined;

  async function read() {
    const stored = await store.read();
    if (stored === undefined) return undefined;
    const record = readHypiHubOAuthRecord(stored);
    if (record.origin !== origin) throw new Error("The OAuth credential belongs to a different HypiHub origin.");
    return record;
  }

  function status(record: HypiHubOAuthRecord): HypiHubOAuthStatus {
    const now = Date.now();
    return {
      status: record.rotationPending || (record.refreshExpiresAt ?? Infinity) <= now ? "reconnect"
        : record.expiresAt <= now + REFRESH_SKEW_MS ? "needs-refresh" : "connected",
      expiresAt: record.expiresAt,
      ...(record.refreshExpiresAt === undefined ? {} : { refreshExpiresAt: record.refreshExpiresAt }),
    };
  }

  async function post(path: string, input: Record<string, string>, signal?: AbortSignal) {
    const deadline = AbortSignal.timeout(timeout);
    const requestSignal = signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
    try {
      return await fetcher(new URL(path, origin), {
        method: "POST", body: new URLSearchParams({ client_id: CLIENT_ID, ...input }),
        redirect: "error", signal: requestSignal,
      });
    } catch {
      signal?.throwIfAborted();
      throw new HypiHubOAuthError("hypihub-oauth-unavailable", "Could not reach the HypiHub authorization service.");
    }
  }

  async function exchange(input: Record<string, string>, signal?: AbortSignal) {
    const issuedAfter = Date.now();
    const response = await post("/oauth/token", input, signal);
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => undefined);
      if (input.grant_type === "refresh_token" && typeof body === "object" && body !== null
        && "error" in body && body.error === "invalid_grant") throw reconnect();
      throw new HypiHubOAuthError(response.status >= 500 ? "hypihub-oauth-unavailable" : "hypihub-oauth-rejected",
        `HypiHub rejected the authorization exchange (HTTP ${response.status}).`);
    }
    const body = fields(await response.json().catch(() => undefined));
    const { access_token, refresh_token, expires_in, refresh_token_expires_in, token_type, scope } = body;
    if (!token(access_token) || !token(refresh_token) || !timestamp(expires_in)
      || typeof token_type !== "string" || token_type.toLowerCase() !== "bearer") {
      throw new Error("HypiHub returned an incomplete OAuth token pair.");
    }
    if (scope !== undefined && (typeof scope !== "string" || SCOPES.some(required => !scope.split(/\s+/u).includes(required)))) {
      throw new HypiHubOAuthError("hypihub-oauth-rejected", "The HypiHub grant is missing required permissions.");
    }
    return readHypiHubOAuthRecord({
      origin, accessToken: access_token, refreshToken: refresh_token, expiresAt: issuedAfter + expires_in * 1_000,
      ...(timestamp(refresh_token_expires_in) ? { refreshExpiresAt: issuedAfter + refresh_token_expires_in * 1_000 } : {}),
    });
  }

  return {
    id: options.id,
    origin,
    beginAuthorization({ callbackPort, timeoutMs = 5 * 60_000 } = {}) {
      if (active !== undefined) throw new Error("HypiHub authorization is already in progress.");
      if (callbackPort !== undefined && (!Number.isInteger(callbackPort) || callbackPort < 1 || callbackPort > 65_535)) {
        throw new Error("Invalid HypiHub OAuth callback port.");
      }
      const expiresAt = Date.now() + duration(timeoutMs, "authorization timeout");
      const verifier = randomBytes(32).toString("base64url");
      const nonce = randomBytes(24).toString("base64url");
      const state = callbackPort === undefined ? nonce : `${nonce}.${callbackPort}`;
      const url = new URL("/oauth/consent", origin);
      url.search = new URLSearchParams({
        response_type: "code", client_id: CLIENT_ID, redirect_uri: redirectUri, scope: SCOPES.join(" "),
        state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
      }).toString();
      let used = false;
      const attempt: HypiHubOAuthAttempt = {
        authorizationUrl: url.href, callbackOrigin: origin, expiresAt,
        acceptsState: value => active === attempt && !used && Date.now() < expiresAt && value === state,
        async complete(result, signal) {
          if (!attempt.acceptsState(result.state)) throw new Error("HypiHub authorization response does not match an active request.");
          used = true;
          try {
            if (result.error !== undefined) throw new HypiHubOAuthError("hypihub-oauth-rejected", "HypiHub authorization was declined.");
            if (!token(result.code)) throw new Error("HypiHub authorization response contains no valid code.");
            const code = result.code;
            return await store.withLock(async () => {
              signal?.throwIfAborted();
              const previous = await read();
              if (previous !== undefined) throw new Error("Disconnect this HypiHub credential slot before authorizing it again.");
              const record = await exchange({
                grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier,
              }, signal);
              await store.write(record);
              return status(record);
            });
          } finally {
            if (active === attempt) active = undefined;
          }
        },
        cancel() { if (!used && active === attempt) active = undefined; },
      };
      active = attempt;
      return attempt;
    },
    async status() {
      const record = await read();
      return record === undefined ? { status: "disconnected" } : status(record);
    },
    async inspectAccess() {
      const record = await read();
      if (record === undefined) return { status: "disconnected" };
      const current = status(record).status;
      return current === "connected" ? { status: current, token: record.accessToken } : { status: current };
    },
    async accessToken(rejectedToken) {
      const usable = (record: HypiHubOAuthRecord) =>
        record.accessToken !== rejectedToken && record.expiresAt > Date.now() + REFRESH_SKEW_MS;
      if (refreshing !== undefined) return await refreshing;
      const record = await read();
      if (record === undefined) throw reconnect();
      if (refreshing !== undefined) return await refreshing;
      if (usable(record)) return record.accessToken;
      refreshing = store.withLock(async () => {
        const current = await read();
        if (current === undefined) throw reconnect();
        if (usable(current)) return current.accessToken;
        if (status(current).status === "reconnect") throw reconnect();
        // HypiHub rotates a single-use token. Persist uncertainty before issuing the request
        // so a restart after a lost reply cannot replay the old refresh token.
        await store.write({ ...current, rotationPending: true });
        const rotated = await exchange({ grant_type: "refresh_token", refresh_token: current.refreshToken });
        await store.write(rotated);
        return rotated.accessToken;
      });
      try { return await refreshing; }
      finally { refreshing = undefined; }
    },
    async disconnect() {
      if (active !== undefined) throw new Error("Finish or cancel HypiHub authorization before disconnecting.");
      await store.withLock(async () => {
        const record = await read();
        if (record === undefined) return;
        const response = await post("/oauth/revoke", { token: record.refreshToken, token_type_hint: "refresh_token" });
        await response.body?.cancel().catch(() => undefined);
        if (!response.ok) throw new HypiHubOAuthError("hypihub-oauth-unavailable", `Could not revoke the HypiHub grant (HTTP ${response.status}).`);
        await store.remove();
      });
    },
  };
}
