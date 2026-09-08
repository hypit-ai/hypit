import assert from "node:assert/strict";
import test from "node:test";

import type { EndpointCredential } from "@hypit/endpoint-kit";
import { decodeOAuth2Credential, encodeOAuth2Credential } from "@hypit/runtime";

import { createHypiHubAuth } from "../src/oauth.js";

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
