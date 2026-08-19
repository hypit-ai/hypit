import assert from "node:assert/strict";
import test from "node:test";

import { EnvironmentCredentialStore } from "@hypit/credential-store-env";
import { credentialRef } from "@hypit/runtime";

test("environment credentials resolve only the explicitly requested key", async () => {
  const store = new EnvironmentCredentialStore({
    PROVIDER_KEY: "secret-value",
    UNRELATED_SECRET: "must-not-be-enumerated",
  });
  assert.deepEqual(await store.resolve(credentialRef("env", "PROVIDER_KEY")), {
    secret: "secret-value",
  });
  assert.equal(await store.resolve(credentialRef("env", "MISSING")), undefined);
  assert.equal(await store.resolve(credentialRef("keychain", "PROVIDER_KEY")), undefined);
});
