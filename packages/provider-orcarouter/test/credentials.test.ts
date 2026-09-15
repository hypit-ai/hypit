import assert from "node:assert/strict";
import test from "node:test";

import { credentialRef } from "@hypit/runtime";
import type { CredentialValue } from "@hypit/runtime";

import {
  advanceCredentialGeneration, apiKeyCredentialAdapter, createOrcaRouterCredential, decodeOrcaRouterCredential,
  encodeOrcaRouterCredential, orcaRouterAcquisition, pkceVerifier, pkceCredentialAdapter, resetCredentialGenerations,
  storeOrcaRouterCredential,
} from "../src/credentials.js";

const ref = credentialRef("os", "orcarouter.apiKey");

/** A stand-in for the Endpoint's writable credential slot. */
function slot(secret: string) {
  let value = secret;
  return {
    read: () => value,
    replace: async (next: CredentialValue) => { value = next.secret; },
  };
}

test.beforeEach(() => { resetCredentialGenerations(); });

test("a pasted API key and a PKCE-issued key resolve to the same credential", async () => {
  const pasted = slot("sk-orca-pasted-key");
  const issued = slot(encodeOrcaRouterCredential({
    key: "sk-orca-minted-key", generation: 1, state: "ready", issuedVia: "oauth",
  }));
  const apiKey = await apiKeyCredentialAdapter({ secret: pasted.read(), ref, replace: pasted.replace }).resolve();
  const oauth = await pkceCredentialAdapter({ secret: issued.read(), ref, replace: issued.replace }).resolve();
  assert.ok(apiKey !== undefined && oauth !== undefined);
  // The same interface yields the same Bearer value type; only the recorded entry point differs.
  assert.equal(await apiKey.token(), "sk-orca-pasted-key");
  assert.equal(await oauth.token(), "sk-orca-minted-key");
  assert.equal(apiKey.source, "api-key");
  assert.equal(oauth.source, "oauth");
  assert.equal(apiKey.status(), "ready");
  assert.equal(oauth.status(), "ready");
  // Neither entry point resolves a key that arrived through the other one.
  assert.equal(await apiKeyCredentialAdapter({ secret: issued.read(), ref }).resolve(), undefined);
  assert.equal(await pkceCredentialAdapter({ secret: pasted.read(), ref }).resolve(), undefined);
});

test("the API-key adapter reports a missing credential instead of inventing one", async () => {
  assert.equal(await apiKeyCredentialAdapter({ secret: "", ref }).resolve(), undefined);
  assert.equal(await pkceCredentialAdapter({ secret: "   ", ref }).resolve(), undefined);
});

test("a credential round-trips through the stored envelope and nothing else is accepted", () => {
  const encoded = encodeOrcaRouterCredential({ key: "sk-orca-abc", generation: 3, state: "ready", issuedVia: "oauth" });
  assert.deepEqual(decodeOrcaRouterCredential(encoded),
    { key: "sk-orca-abc", generation: 3, state: "ready", issuedVia: "oauth" });
  assert.equal(decodeOrcaRouterCredential("not json")?.key, "not json");
  assert.equal(decodeOrcaRouterCredential('{"format":"other","key":"x"}'), undefined);
  assert.equal(decodeOrcaRouterCredential('{"format":"hypit.orcarouter-credential@1"}'), undefined);
  assert.equal(decodeOrcaRouterCredential(""), undefined);
});

test("storing a key advances the generation so an older rejection cannot reach it", async () => {
  const target = slot("");
  const first = await storeOrcaRouterCredential({ ref, replace: target.replace, key: "sk-orca-one", issuedVia: "oauth" });
  const stale = createOrcaRouterCredential({ secret: target.read(), ref, replace: target.replace })!;
  const second = await storeOrcaRouterCredential({ ref, replace: target.replace, key: "sk-orca-two", issuedVia: "oauth" });
  assert.equal(second.generation, first.generation + 1);
  // Rejecting the credential that made the rejected request must not mark the newer login broken:
  // the late failure is dropped and the credential a fresh login stored stays ready.
  assert.equal(await stale.reject(), "ready");
  assert.equal(createOrcaRouterCredential({ secret: target.read(), ref, replace: target.replace })!.status(), "ready");
  assert.equal(advanceCredentialGeneration(ref), second.generation + 1);
});

test("a rejected durable key is terminal and is never refreshed", async () => {
  const target = slot("sk-orca-durable");
  const credential = createOrcaRouterCredential({ secret: target.read(), ref, replace: target.replace })!;
  assert.equal(credential.status(), "ready");
  assert.equal(await credential.reject(), "needsReauth");
  // The marker is persisted, so the state survives a restart of the process.
  assert.equal(JSON.parse(target.read()).state, "needsReauth");
  await assert.rejects(async () => await credential.token(), /needs authorization/u);
  const reopened = createOrcaRouterCredential({ secret: target.read(), ref, replace: target.replace })!;
  assert.equal(reopened.status(), "needsReauth");
  await assert.rejects(async () => await reopened.token(), /needs authorization/u);
});

test("the declared authorization names the OrcaRouter auth origin and exchange exactly", () => {
  const acquisition = orcaRouterAcquisition({ authBaseUrl: "https://www.orcarouter.ai" });
  assert.equal(acquisition.authorizationEndpoint, "https://www.orcarouter.ai/auth");
  assert.equal(acquisition.tokenEndpoint, "https://www.orcarouter.ai/api/v1/auth/keys");
  // The relay's own host must never carry the exchange: `https://api.orcarouter.ai/v1/auth/keys` is a 404.
  assert.equal(new URL(acquisition.tokenEndpoint).host, "www.orcarouter.ai");
  assert.equal(new URL(acquisition.authorizationEndpoint).host, "www.orcarouter.ai");
  assert.equal(acquisition.delivery, "out-of-band");
  assert.deepEqual(acquisition.authorizeParams, { callback_url: "oob", app_name: "Hypit", scope: "api" });
  assert.equal(acquisition.scopes[0], "api");
  assert.equal(acquisition.exchange?.encoding, "json");
  assert.equal(acquisition.exchange?.fields?.code_challenge_method, "S256");
  assert.equal(acquisition.exchange?.credentialField, "key");
  assert.equal(acquisition.exchange?.credentialFormat, "opaque");
  assert.equal(acquisition.exchange?.requiredScope, "api");
  // No client secret is involved anywhere in the flow.
  assert.equal("clientSecret" in acquisition, false);
});

test("a self-hosted auth origin is honoured and non-loopback HTTP is refused", () => {
  assert.equal(orcaRouterAcquisition({ authBaseUrl: "http://127.0.0.1:8080" }).tokenEndpoint,
    "http://127.0.0.1:8080/api/v1/auth/keys");
  assert.throws(() => orcaRouterAcquisition({ authBaseUrl: "http://orcarouter.example" }), /HTTPS/u);
});

test("each attempt gets a fresh verifier and no verifier is derived from a constant", () => {
  const first = pkceVerifier();
  const second = pkceVerifier();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
});
