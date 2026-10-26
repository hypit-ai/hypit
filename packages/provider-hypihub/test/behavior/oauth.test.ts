import assert from "node:assert/strict";
import test from "node:test";

import type { EndpointCredential } from "@hypit/endpoint";
import { decodeOAuth2Credential, encodeOAuth2Credential } from "@hypit/runtime";

import { createHypiHubAuth, createHypiHubAuthSession } from "../../src/oauth.js";

test("HypiHub rotates OAuth through only its declared credential slot", async () => {
  let saved: string | undefined;
  const requests: URLSearchParams[] = [];
  const credential: EndpointCredential = {
    secret: encodeOAuth2Credential({
      accessToken: "expired-access",
      refreshToken: "refresh-one",
      expiresAt: Date.now() - 1,
    }),
    async replace(value) { saved = value.secret; },
  };
  const auth = createHypiHubAuth({
    credential,
    baseUrl: "https://hypit.ai/v1",
    requestTimeoutMs: 1_000,
    fetch: async (_input, init) => {
      requests.push(new URLSearchParams(String(init?.body)));
      return Response.json({
        access_token: "fresh-access",
        refresh_token: "refresh-two",
        expires_in: 3600,
      });
    },
  });

  assert.equal(await auth.token(), "fresh-access");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.get("grant_type"), "refresh_token");
  assert.equal(requests[0]?.get("refresh_token"), "refresh-one");
  assert(saved !== undefined);
  const decoded = decodeOAuth2Credential(saved);
  assert.equal(decoded?.accessToken, "fresh-access");
  assert.equal(decoded?.refreshToken, "refresh-two");
  assert(decoded?.expiresAt !== undefined && decoded.expiresAt > Date.now());
});

test("one activated Provider credential session shares a concurrent OAuth refresh", async () => {
  let refreshes = 0;
  let replacements = 0;
  let finishRefresh!: () => void;
  const release = new Promise<void>((resolve) => { finishRefresh = resolve; });
  const credential: EndpointCredential = {
    secret: encodeOAuth2Credential({
      accessToken: "expired-access",
      refreshToken: "refresh-once",
      expiresAt: 1,
    }),
    async replace() { replacements += 1; },
  };
  const session = createHypiHubAuthSession({
    baseUrl: "https://hypit.ai/v1",
    requestTimeoutMs: 1_000,
    fetch: async () => {
      refreshes += 1;
      await release;
      return Response.json({ access_token: "shared-access", expires_in: 3600 });
    },
  });

  const tokens = Promise.all(Array.from({ length: 4 }, async () => await session.auth(credential).token()));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(refreshes, 1);
  finishRefresh();
  assert.deepEqual(await tokens, Array(4).fill("shared-access"));
  assert.equal(replacements, 1);
});

test("a static HypiHub API key remains an ordinary non-refreshing credential", async () => {
  const auth = createHypiHubAuth({
    credential: { secret: "static-api-key" },
    baseUrl: "https://hypit.ai",
    requestTimeoutMs: 1_000,
    fetch: async () => { throw new Error("static credentials do not refresh"); },
  });
  assert.equal(await auth.token(), "static-api-key");
  assert.equal(auth.canRefresh(), false);
});

test("rejected refresh retains its public reason and request id without storing response credentials", async () => {
  const auth = createHypiHubAuth({
    credential: {
      secret: encodeOAuth2Credential({ accessToken: "old", refreshToken: "secret-refresh", expiresAt: 1 }),
      replace: async () => { throw new Error("Rejected refresh must not replace a credential"); },
    }, baseUrl: "https://hypit.ai", requestTimeoutMs: 1_000,
    fetch: async () => Response.json({ error: "invalid_grant", error_description: "Refresh grant expired",
      access_token: "unexpected-secret", refresh_token: "unexpected-refresh" },
    { status: 400, headers: { "x-request-id": "req-refresh" } }),
  });
  await assert.rejects(auth.token(), (error: Error) => {
    assert.match(error.message, /HTTP 400; invalid_grant; POST https:\/\/hypit.ai\/oauth\/token; request=req-refresh: Refresh grant expired/u);
    assert.doesNotMatch(error.message, /unexpected|secret-refresh/u);
    return true;
  });
});
