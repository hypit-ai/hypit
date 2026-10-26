import type { EndpointCredential } from "@hypit/hypit/endpoint";
import {
  decodeOAuth2Credential,
  encodeOAuth2Credential,
} from "@hypit/hypit/endpoint";
import { EndpointResponseError, EndpointTransportError, withRequestDeadline } from "@hypit/hypit/endpoint/http";
import { HypiHubHttpError } from "./errors.js";

const OAUTH_CLIENT_ID = "hyc_d5d5e8e7131b0c877756e66c";
const REFRESH_SKEW_MS = 60_000;

/** Read-only diagnostics can identify expiry without attempting credential rotation. */
export function hypiHubCredentialNeedsRefresh(secret: string, now = Date.now()): boolean {
  const expiresAt = decodeOAuth2Credential(secret)?.expiresAt;
  return expiresAt !== undefined && expiresAt <= now + REFRESH_SKEW_MS;
}

type OAuthTokenResponse = {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly expires_at?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

export type HypiHubAuth = {
  token(): Promise<string>;
  canRefresh(): boolean;
  refresh(): Promise<string>;
};

export type HypiHubAuthSession = {
  /**
   * Resolve the authentication state for this activated Provider's one declared credential slot.
   * Credential rotation remains inside that state, so concurrent Endpoint calls share refresh.
   */
  auth(credential: EndpointCredential): HypiHubAuth;
};

/**
 * One activated HypiHub Provider owns one declared credential slot. Keep that slot's mutable OAuth
 * interpretation at the Provider boundary instead of recreating it for every Endpoint invocation.
 * Reconfiguring credentials reactivates the Provider; normal token rotation uses the slot's narrow
 * replace authority and stays visible to every concurrent caller in this process.
 */
export function createHypiHubAuthSession(options: {
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly fetch: typeof globalThis.fetch;
}): HypiHubAuthSession {
  let auth: HypiHubAuth | undefined;
  return {
    auth(credential) {
      auth ??= createHypiHubAuth({ ...options, credential });
      return auth;
    },
  };
}

/**
 * Interpret one declared HypiHub credential. Raw values are ordinary static API keys. OAuth values
 * use the host-neutral credential envelope written by the CLI. Rotation can replace only this
 * credential slot; the Provider never receives a CredentialStore or another credential reference.
 */
export function createHypiHubAuth(options: {
  readonly credential: EndpointCredential;
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly fetch: typeof globalThis.fetch;
}): HypiHubAuth {
  const decoded = decodeOAuth2Credential(options.credential.secret);
  let accessToken = decoded?.accessToken ?? options.credential.secret;
  let refreshToken = decoded?.refreshToken;
  let expiresAt = decoded?.expiresAt;
  let refreshing: Promise<string> | undefined;
  const tokenEndpoint = new URL("/oauth/token", new URL(options.baseUrl).origin).toString();

  const refresh = async (): Promise<string> => {
    if (refreshing !== undefined) return await refreshing;
    if (refreshToken === undefined) throw new Error("HypiHub credential has no refresh token; run hypit auth login");
    const replace = options.credential.replace;
    if (replace === undefined) {
      throw new Error("HypiHub OAuth credential is read-only; run hypit auth login with a writable Credential Store");
    }
    refreshing = (async () => {
      return await withRequestDeadline(options.requestTimeoutMs, async ({ signal, wait }) => {
        const response = await wait(options.fetch(tokenEndpoint, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken!,
            client_id: OAUTH_CLIENT_ID,
          }),
          signal,
        }));
        const text = await wait(response.text());
        if (!response.ok) throw new HypiHubHttpError(response.status, response, text, {
          method: "POST", url: tokenEndpoint,
        });
        let body: OAuthTokenResponse;
        try { body = JSON.parse(text) as OAuthTokenResponse; }
        catch { throw new EndpointResponseError(`HypiHub OAuth refresh returned invalid JSON (${response.status})`); }
        assert(typeof body.access_token === "string" && body.access_token.length > 0,
          "HypiHub OAuth refresh returned no access token");
        accessToken = body.access_token;
        if (typeof body.refresh_token === "string" && body.refresh_token.length > 0) {
          refreshToken = body.refresh_token;
        }
        expiresAt = tokenExpiry(body);
        await replace({
          secret: encodeOAuth2Credential({
            accessToken,
            ...(refreshToken === undefined ? {} : { refreshToken }),
            ...(expiresAt === undefined ? {} : { expiresAt }),
          }),
          ...(expiresAt === undefined ? {} : { expiresAt }),
        });
        return accessToken;
      }, () => new EndpointTransportError("HypiHub OAuth refresh timed out", { timeout: true }));
    })();
    try { return await refreshing; }
    finally { refreshing = undefined; }
  };

  return {
    async token() {
      if (expiresAt !== undefined && expiresAt <= Date.now() + REFRESH_SKEW_MS) return await refresh();
      return accessToken;
    },
    canRefresh() {
      return refreshToken !== undefined && options.credential.replace !== undefined;
    },
    refresh,
  };
}
