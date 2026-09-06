import assert from "node:assert/strict";
import test from "node:test";

import type { CredentialValue, WritableCredentialStore } from "@hypit/runtime";
import { credentialRef } from "@hypit/runtime";

import {
  createHypiHubAuth,
  decodeHypiHubOAuthCredential,
  encodeHypiHubOAuthCredential,
} from "../src/oauth.js";

test("HypiHub OAuth refreshes an expired token and persists rotated credentials", async () => {
  const ref = credentialRef("memory", "hypihub.oauth");
  const values = new Map<string, CredentialValue>();
  const store: WritableCredentialStore = {
    owns(candidate) { return candidate.store === "memory"; },
    async resolve(candidate) { return values.get(candidate.key); },
    async put(candidate, value) { values.set(candidate.key, value); },
    async delete(candidate) { return values.delete(candidate.key); },
  };
  const requests: URLSearchParams[] = [];
  const auth = createHypiHubAuth({
    secret: encodeHypiHubOAuthCredential({
      accessToken: "expired-access",
      refreshToken: "refresh-one",
      expiresAt: Date.now() - 1,
    }),
    baseUrl: "https://hypit.ai/v1",
    credentialStore: store,
    credentialRef: ref,
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
  const saved = values.get(ref.key);
  assert(saved !== undefined);
  assert.deepEqual(decodeHypiHubOAuthCredential(saved.secret), {
    format: "hypit.hypihub-oauth@1",
    accessToken: "fresh-access",
    refreshToken: "refresh-two",
    expiresAt: saved.expiresAt,
  });
  assert(saved.expiresAt !== undefined && saved.expiresAt > Date.now());
});

test("raw HypiHub API keys remain backward compatible and are never refreshed", async () => {
  const auth = createHypiHubAuth({
    secret: "static-api-key",
    baseUrl: "https://hypit.ai",
    fetch: async () => { throw new Error("static keys must not refresh"); },
  });
  assert.equal(await auth.token(), "static-api-key");
  assert.equal(auth.canRefresh(), false);
});
