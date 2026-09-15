import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
      fetch: async (_input, init) => await new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted === true) {
          reject(signal.reason);
          return;
        }
        // A real pending request keeps the event loop alive; AbortSignal.timeout does not.
        const response = setTimeout(() => resolve(Response.json({ access_token: "late" })), 1_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(response);
          reject(signal.reason);
        }, { once: true });
      }),
    }),
    /token exchange timed out after 20 ms.*no credential was stored/u,
  );
});

test("out-of-band acquisition shows the code, exchanges it with S256, and never starts a listener", async () => {
  const sent: { readonly url: string; readonly body: Record<string, string> }[] = [];
  const opened: string[] = [];
  const raw = await acquireOAuthCredential({
    ...acquisition,
    delivery: "out-of-band",
    authorizeParams: { callback_url: "oob", app_name: "Test Tool", scope: "api" },
    exchange: { encoding: "json", fields: { code_challenge_method: "S256" }, credentialField: "key", credentialFormat: "opaque", requiredScope: "api" },
  }, {
    open: (url) => opened.push(url),
    readCode: async () => "displayed-code",
    fetch: async (input, init) => {
      sent.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, string> });
      return Response.json({ key: "sk-orca-test", user_id: "1", scope: "api" });
    },
  });

  // A pasted code yields the durable key itself, not a refreshable token envelope.
  assert.equal(raw, "sk-orca-test");
  const authorize = new URL(opened[0]!);
  assert.equal(authorize.pathname, "/authorize");
  assert.equal(authorize.searchParams.get("callback_url"), "oob");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("response_type"), null);
  assert.equal(sent[0]!.url, acquisition.tokenEndpoint);
  assert.equal(sent[0]!.body.code, "displayed-code");
  assert.equal(sent[0]!.body.code_challenge_method, "S256");
  assert.equal(sent[0]!.body.grant_type, undefined);
  const verifier = sent[0]!.body.code_verifier!;
  assert.equal(Buffer.from(createHash("sha256").update(verifier).digest()).toString("base64url"),
    authorize.searchParams.get("code_challenge"));
  // The verifier is never placed on the URL a browser or its history can see.
  assert.ok(!opened[0]!.includes(verifier));
});

test("out-of-band acquisition refuses a narrower granted scope", async () => {
  await assert.rejects(
    async () => await acquireOAuthCredential({
      ...acquisition,
      delivery: "out-of-band",
      exchange: { encoding: "json", credentialField: "key", credentialFormat: "opaque", requiredScope: "api" },
    }, {
      open: () => {},
      readCode: async () => "displayed-code",
      fetch: async () => Response.json({ key: "sk-orca-test", scope: "connector" }),
    }),
    /granted scope "connector", not "api"/u,
  );
});
