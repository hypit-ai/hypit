import type { CredentialRef, CredentialStore } from "@hypit/runtime";
import { writableCredentialStore } from "@hypit/runtime";

const OAUTH_CLIENT_ID = "hyc_d5d5e8e7131b0c877756e66c";
const REFRESH_SKEW_MS = 60_000;

type OAuthTokenResponse = {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly expires_at?: unknown;
};

type StoredOAuthCredential = {
  readonly format: "hypit.hypihub-oauth@1";
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "HypiHub OAuth response is invalid");
  return value as Record<string, unknown>;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function tokenExpiry(value: OAuthTokenResponse): number | undefined {
  const absolute = positiveNumber(value.expires_at);
  if (absolute !== undefined) return absolute > 10_000_000_000 ? absolute : absolute * 1_000;
  const seconds = positiveNumber(value.expires_in);
  return seconds === undefined ? undefined : Date.now() + seconds * 1_000;
}

export function encodeHypiHubOAuthCredential(value: {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresAt?: number;
}): string {
  assert(value.accessToken.length > 0, "HypiHub OAuth access token is empty");
  return JSON.stringify({
    format: "hypit.hypihub-oauth@1",
    accessToken: value.accessToken,
    ...(value.refreshToken === undefined ? {} : { refreshToken: value.refreshToken }),
    ...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
  } satisfies StoredOAuthCredential);
}

export function decodeHypiHubOAuthCredential(secret: string): StoredOAuthCredential {
  try {
    const parsed = object(JSON.parse(secret)) as Partial<StoredOAuthCredential>;
    if (parsed.format === "hypit.hypihub-oauth@1"
      && typeof parsed.accessToken === "string" && parsed.accessToken.length > 0
      && (parsed.refreshToken === undefined || typeof parsed.refreshToken === "string")
      && (parsed.expiresAt === undefined || typeof parsed.expiresAt === "number")) {
      return parsed as StoredOAuthCredential;
    }
  } catch {
    // A raw secret is a supported static API key and remains backward compatible.
  }
  return { format: "hypit.hypihub-oauth@1", accessToken: secret };
}

export type HypiHubAuth = {
  token(): Promise<string>;
  canRefresh(): boolean;
  refresh(): Promise<string>;
};

export function createHypiHubAuth(options: {
  readonly secret: string;
  readonly baseUrl: string;
  readonly fetch: typeof globalThis.fetch;
  readonly credentialStore?: CredentialStore;
  readonly credentialRef?: CredentialRef;
}): HypiHubAuth {
  let stored = decodeHypiHubOAuthCredential(options.secret);
  let refreshInFlight: Promise<string> | undefined;
  const origin = new URL(options.baseUrl).origin;

  const save = async (): Promise<void> => {
    if (options.credentialStore === undefined || options.credentialRef === undefined) return;
    const store = await writableCredentialStore(options.credentialStore, options.credentialRef);
    if (store === undefined) return;
    await store.put(options.credentialRef, {
      secret: encodeHypiHubOAuthCredential(stored),
      ...(stored.expiresAt === undefined ? {} : { expiresAt: stored.expiresAt }),
    });
  };

  const refresh = async (): Promise<string> => {
    if (refreshInFlight !== undefined) return await refreshInFlight;
    if (stored.refreshToken === undefined) {
      throw new Error("HypiHub OAuth access token expired and no refresh token is available; run hypit auth login");
    }
    refreshInFlight = (async () => {
      const response = await options.fetch(`${origin}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: stored.refreshToken!,
          client_id: OAUTH_CLIENT_ID,
        }),
      });
      const text = await response.text();
      let body: OAuthTokenResponse;
      try { body = object(text.length === 0 ? {} : JSON.parse(text)) as OAuthTokenResponse; }
      catch { throw new Error(`HypiHub OAuth refresh returned invalid JSON (${response.status})`); }
      if (!response.ok) throw new Error(`HypiHub OAuth refresh failed (${response.status}): ${text.slice(0, 200)}`);
      assert(typeof body.access_token === "string" && body.access_token.length > 0,
        "HypiHub OAuth refresh returned no access token");
      const expiresAt = tokenExpiry(body);
      stored = {
        format: "hypit.hypihub-oauth@1",
        accessToken: body.access_token,
        ...(typeof body.refresh_token === "string" && body.refresh_token.length > 0
          ? { refreshToken: body.refresh_token } : stored.refreshToken === undefined ? {} : { refreshToken: stored.refreshToken }),
        ...(expiresAt === undefined ? {} : { expiresAt }),
      };
      await save();
      return stored.accessToken;
    })();
    try { return await refreshInFlight; }
    finally { refreshInFlight = undefined; }
  };

  return {
    async token() {
      if (stored.refreshToken !== undefined && stored.expiresAt !== undefined
        && stored.expiresAt <= Date.now() + REFRESH_SKEW_MS) return await refresh();
      return stored.accessToken;
    },
    canRefresh() { return stored.refreshToken !== undefined; },
    refresh,
  };
}
