import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import test from "node:test";

import { decodeOAuth2Credential } from "@hypit/runtime";

import { acquireOAuthCredential } from "../src/oauth.js";

const acquisition = {
  kind: "oauth2-pkce" as const,
  authorizationEndpoint: "https://identity.example.test/authorize",
  tokenEndpoint: "https://identity.example.test/token",
  clientId: "client",
  scopes: ["work"],
  requestTimeoutMs: 1_000,
};

function returnAuthorization(url: string, page: (html: string) => void): void {
  const authorization = new URL(url);
  const redirect = new URL(authorization.searchParams.get("redirect_uri")!);
  redirect.searchParams.set("state", authorization.searchParams.get("state")!);
  redirect.searchParams.set("code", "authorization-code");
  void globalThis.fetch(redirect).then(async (response) => {
    assert.equal(response.status, 200);
    page(await response.text());
  });
}

test("OAuth callback reports authorization while the CLI finishes the credential", async () => {
  let resolveCallback!: (html: string) => void;
  const callbackPage = new Promise<string>((resolve) => { resolveCallback = resolve; });
  const progress: string[] = [];
  const raw = await acquireOAuthCredential(acquisition, {
    onProgress: (message) => progress.push(message),
    open: (url) => returnAuthorization(url, resolveCallback),
    fetch: async (input, init) => {
      assert.equal(String(input), acquisition.tokenEndpoint);
      assert.equal(init?.signal?.aborted, false);
      return Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 60 });
    },
  });

  const credential = decodeOAuth2Credential(raw);
  const callbackHtml = await callbackPage;
  assert.equal(credential?.accessToken, "access");
  assert.match(callbackHtml, /Authorization received/u);
  assert.doesNotMatch(callbackHtml, /credential is ready|signed in to Hypit/iu);
  assert.deepEqual(progress.slice(1), [
    "Authorization returned. Exchanging token…",
    "Token received. Saving credential…",
  ]);
});

test("OAuth callback releases another browser connection after sending its page", async () => {
  let browserConnection: ReturnType<typeof createConnection> | undefined;
  const raw = await acquireOAuthCredential(acquisition, {
    open: (url) => {
      const authorization = new URL(url);
      const redirect = new URL(authorization.searchParams.get("redirect_uri")!);
      browserConnection = createConnection({ host: redirect.hostname, port: Number(redirect.port) });
      void once(browserConnection, "connect").then(() => {
        browserConnection!.write(`GET /favicon.ico HTTP/1.1\r\nHost: ${redirect.host}\r\n`);
        returnAuthorization(url, () => {});
      });
    },
    fetch: async () => Response.json({ access_token: "access" }),
  });

  assert.equal(decodeOAuth2Credential(raw)?.accessToken, "access");
  assert.ok(browserConnection);
  if (!browserConnection.destroyed) {
    await once(browserConnection, "close", { signal: AbortSignal.timeout(1_000) });
  }
});

test("OAuth token exchange uses the Endpoint-declared request timeout", async () => {
  await assert.rejects(
    async () => await acquireOAuthCredential({ ...acquisition, requestTimeoutMs: 20 }, {
      open: (url) => returnAuthorization(url, () => {}),
      fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted === true) {
          reject(signal.reason);
          return;
        }
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }),
    /token exchange timed out after 20 ms.*no credential was stored/u,
  );
});
