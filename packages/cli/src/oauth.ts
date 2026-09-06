import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

import type { CredentialAcquisition } from "@hypit/runtime";
import { encodeOAuth2Credential } from "@hypit/runtime";

import type { CliIo } from "./output.js";

const CALLBACK_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true"><path d="M7.6 3.8H14.6L12.6 7.2H5.6L7.6 3.8Z" fill="currentColor"/><path d="M4.1 10.4H16.6L18.7 7H30.4L27.9 11.1H16.1L14.1 14.2H1.8L4.1 10.4Z" fill="currentColor"/><path d="M19.1 14.1H23.1L19.3 20.7H15.4L19.1 14.1Z" fill="currentColor"/></svg>`;

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
  const favicon = `data:image/svg+xml,${encodeURIComponent(CALLBACK_MARK_SVG)}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <link rel="icon" href="${favicon}">
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light dark;
        --accent: #de3b67;
        --ink: #1b1a18;
        --muted: #6b6963;
        --line: #e5e2dd;
        --paper: #fff;
        --gutter: 80px;
        --bad: #b8352a;
        font-family: "Hanken Grotesk", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      }
      * { box-sizing: border-box; }
      html { min-width: 320px; }
      body { min-height: 100vh; margin: 0; display: flex; flex-direction: column; color: var(--ink); background: var(--paper); -webkit-font-smoothing: antialiased; }
      .site-header { height: 64px; flex: 0 0 64px; border-bottom: 1px solid var(--line); }
      .shell { width: 100%; max-width: 1440px; height: 100%; margin: 0 auto; padding-inline: var(--gutter); display: flex; align-items: center; }
      .brand { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-size: 20px; font-weight: 650; letter-spacing: -.04em; }
      .brand svg { width: 28px; height: 28px; color: var(--accent); }
      main { flex: 1 1 auto; display: grid; place-items: center; padding: clamp(64px, 11vh, 144px) var(--gutter) clamp(72px, 12vh, 160px); }
      .hero { width: min(100%, 720px); text-align: center; }
      .status { display: flex; justify-content: center; margin-bottom: 28px; color: var(--accent); }
      .status.error { color: var(--bad); }
      .mark { width: 56px; height: 56px; display: grid; place-items: center; border: 1px solid currentColor; border-radius: 8px; }
      .mark svg { width: 32px; height: 32px; }
      h1 { margin: 0; font-size: clamp(38px, 5vw, 62px); font-weight: 600; line-height: 1.18; letter-spacing: -2px; }
      p { max-width: 540px; margin: 20px auto 0; color: var(--muted); font-size: clamp(17px, 1.6vw, 22px); line-height: 1.5; }
      @media (prefers-color-scheme: dark) {
        :root { --paper: #14110f; --ink: #e9e5db; --muted: #e9e5dba8; --line: #e9e5db1c; --accent: #de3c66; --bad: #ef8378; }
      }
      @media (max-width: 767px) { :root { --gutter: 20px; } main { padding-top: 64px; padding-bottom: 80px; } }
      @media (prefers-reduced-motion: reduce) { * { transition-duration: .01ms !important; animation-duration: .01ms !important; } }
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="shell"><div class="brand">${CALLBACK_MARK_SVG}<span>hypit</span></div></div>
    </header>
    <main>
      <section class="hero" aria-labelledby="callback-heading">
        <div class="status ${tone}">
          <span class="mark" aria-hidden="true">
            ${success ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6 18 18M18 6 6 18"/></svg>'}
          </span>
        </div>
        <h1 id="callback-heading">${heading}</h1>
        <p>${message}</p>
      </section>
    </main>
  </body>
</html>`;
}
