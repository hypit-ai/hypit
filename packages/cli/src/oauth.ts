import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

import type { CredentialAcquisition } from "@hypit/runtime";
import { encodeOAuth2Credential } from "@hypit/runtime";

import type { CliIo } from "./output.js";

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function tokenExpiry(value: { readonly expires_at?: unknown; readonly expires_in?: unknown }): number | undefined {
  const absolute = positiveNumber(value.expires_at);
  if (absolute !== undefined) return absolute > 10_000_000_000 ? absolute : absolute * 1_000;
  const seconds = positiveNumber(value.expires_in);
  return seconds === undefined ? undefined : Date.now() + seconds * 1_000;
}

/** Acquire one OAuth credential from the exact data declared by its Endpoint package. */
export async function acquireOAuthCredential(
  io: CliIo,
  acquisition: CredentialAcquisition,
): Promise<string> {
  const verifier = base64url(randomBytes(32));
  // S256 is part of OAuth PKCE. It authenticates this browser exchange; it is not content identity.
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(24));
  const server = createServer();
  const callback = new Promise<string>((resolveCode, reject) => {
    let settled = false;
    server.on("request", (request, response) => {
      if (settled) {
        response.writeHead(204, { "cache-control": "no-store", connection: "close" });
        response.end();
        return;
      }
      try {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname !== "/callback") throw new Error("unexpected OAuth callback path");
        if (url.searchParams.get("state") !== state) throw new Error("OAuth state mismatch");
        const authorizationError = url.searchParams.get("error");
        if (authorizationError !== null) throw new Error(`OAuth authorization failed: ${authorizationError}`);
        const code = url.searchParams.get("code");
        if (code === null || code.length === 0) throw new Error("OAuth callback contained no code");
        response.writeHead(200, {
          "cache-control": "no-store",
          connection: "close",
          "content-type": "text/html; charset=utf-8",
        });
        response.end(callbackPage(true));
        settled = true;
        resolveCode(code);
      } catch (error) {
        response.writeHead(400, {
          "cache-control": "no-store",
          connection: "close",
          "content-type": "text/html; charset=utf-8",
        });
        response.end(callbackPage(false));
        settled = true;
        reject(error);
      } finally {
        server.close();
        server.closeIdleConnections?.();
      }
    });
    server.once("error", reject);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
    server.once("error", rejectListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("could not open a local OAuth callback");
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  const authorize = new URL(acquisition.authorizationEndpoint);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", acquisition.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", acquisition.scopes.join(" "));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  io.write(`Opening sign-in: ${authorize}\n`);
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const openerArgs = process.platform === "win32" ? ["/c", "start", "", authorize.toString()] : [authorize.toString()];
  spawn(opener, openerArgs, { stdio: "ignore", detached: true, windowsHide: true }).unref();
  const code = await callback;
  const tokenResponse = await fetch(acquisition.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: acquisition.clientId,
      code_verifier: verifier,
    }),
  });
  const body = await tokenResponse.text();
  if (!tokenResponse.ok) throw new Error(`OAuth token exchange failed (${tokenResponse.status}): ${body.slice(0, 200)}`);
  const parsed = JSON.parse(body) as {
    readonly access_token?: unknown;
    readonly refresh_token?: unknown;
    readonly expires_at?: unknown;
    readonly expires_in?: unknown;
  };
  if (typeof parsed.access_token !== "string" || parsed.access_token.length === 0) {
    throw new Error("OAuth token response contained no access token");
  }
  const expiresAt = tokenExpiry(parsed);
  return encodeOAuth2Credential({
    accessToken: parsed.access_token,
    ...(typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0
      ? { refreshToken: parsed.refresh_token }
      : {}),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  });
}

function callbackPage(success: boolean): string {
  const title = success ? "Signed in to Hypit" : "Hypit sign-in failed";
  const heading = success ? "Hypit is signed in" : "Hypit sign-in failed";
  const message = success
    ? "Your credential is ready. You can close this window."
    : "The sign-in could not be completed. You can close this window and try again.";
  const tone = success ? "success" : "error";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>${title}</title><style>
:root{color-scheme:dark;font-family:ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;color:#f7f2f4;background:#111114}main{width:min(100% - 40px,460px);padding:42px 38px 36px;border:1px solid #3a3036;background:#19171b}.brand{color:#ed98b9;font-weight:700}.mark{margin:34px 0 24px;color:#ed98b9}.mark.error{color:#f08d86}h1{margin:0;font-size:32px}p{color:#bdb3b8;line-height:1.6}
</style></head><body><main><div class="brand">HYPIT</div><div class="mark ${tone}">${success ? "✓" : "×"}</div><h1>${heading}</h1><p>${message}</p></main></body></html>`;
}
