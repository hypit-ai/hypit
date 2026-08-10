import assert from "node:assert/strict";
import test from "node:test";

import { createEnvironmentCredentialStorePackage } from "@narratage/credential-store-env";
import { credentialRef } from "@narratage/runtime";
import type { CredentialStore } from "@narratage/runtime";

import {
  KeychainCredentialStore,
  createKeychainCredentialStorePackage,
  keychainAddCommand,
} from "@narratage/credential-store-keychain";

const reader = (entries: Readonly<Record<string, string>>) =>
  async (_service: string, account: string) => entries[account];

test("it answers for its own store name and declines every other", async () => {
  const store = new KeychainCredentialStore({ read: reader({ KIE_API_KEY: "secret" }) });
  assert.deepEqual(await store.resolve(credentialRef("keychain", "KIE_API_KEY")), { secret: "secret" });
  // Not this store's business: the environment store's references are not
  // guessed at, they are declined.
  assert.equal(await store.resolve(credentialRef("env", "KIE_API_KEY")), undefined);
});

test("an absent entry is absent, and an empty one is not a secret", async () => {
  const store = new KeychainCredentialStore({ read: reader({ EMPTY: "" }) });
  assert.equal(await store.resolve(credentialRef("keychain", "ABSENT")), undefined);
  assert.equal(await store.resolve(credentialRef("keychain", "EMPTY")), undefined);
});

test("a malformed reference is refused before anything is looked up", async () => {
  let asked = 0;
  const store = new KeychainCredentialStore({ read: async () => { asked += 1; return "x"; } });
  await assert.rejects(async () => await store.resolve({ format: "svml.credential-ref@1", store: "keychain", key: " " } as never));
  assert.equal(asked, 0);
});

test("the configured service is part of the instance's identity, and holds no secret", () => {
  const configured = createKeychainCredentialStorePackage({ instance: "credentials.team", service: "acme" });
  assert.equal(configured.services[0]?.instance.id, "credentials.team");
  // Configuration reaches identity as a digest and is not carried in the
  // Closure, so the proof that the service name counts is that a different
  // name is a different instance.
  const other = createKeychainCredentialStorePackage({ instance: "credentials.team", service: "other" });
  assert.ok(configured.services[0]?.instance.configurationDigest);
  assert.notEqual(
    configured.services[0]?.instance.configurationDigest,
    other.services[0]?.instance.configurationDigest,
  );
  assert.equal(JSON.stringify(configured).includes("secret"), false);
});

test("it can say how to put a secret where it will be found", () => {
  assert.equal(keychainAddCommand("KIE_API_KEY"), "security add-generic-password -s narratage -a KIE_API_KEY -w");
});

test("writable facet stores and removes only keychain-owned references", async () => {
  const values = new Map<string, string>();
  const store = new KeychainCredentialStore({
    read: async (_service, account) => values.get(account),
    write: async (_service, account, secret) => { values.set(account, secret); },
    remove: async (_service, account) => values.delete(account),
  });
  const ref = credentialRef("keychain", "provider.api-key");
  assert.equal(store.owns(ref), true);
  await store.put(ref, { secret: "new-secret" });
  assert.deepEqual(await store.resolve(ref), { secret: "new-secret" });
  assert.equal(await store.delete(ref), true);
  assert.equal(await store.resolve(ref), undefined);
  await assert.rejects(store.put(credentialRef("env", "PROVIDER_KEY"), { secret: "x" }), /does not own/u);
});

/**
 * The reason a second implementation was written.
 *
 * `CredentialRef.store` names which store answers, and both stores decline a
 * reference addressed to the other. That only works if a Runtime can hold both,
 * and today a Runtime holds exactly one credential-store: `chooseService`
 * refuses a second, and the execution driver treats one `undefined` as "this
 * credential is unavailable" and fails the Operation.
 *
 * So a deployment that keeps API keys in the environment and signing keys in
 * the keychain cannot be expressed, and the `store` field is decoration: it has
 * to name whichever single store happens to be installed.
 *
 * This test states the composition that ought to work. It is written against a
 * local composite so that it describes the intended behaviour exactly, and it
 * is the specification for changing the assembly.
 */
test("two stores compose by name, which is what the store field is for", async () => {
  const environment = createEnvironmentCredentialStorePackage({
    environment: { KIE_API_KEY: "from-env" },
  }).services[0]!.service as CredentialStore;
  const keychain = new KeychainCredentialStore({ read: reader({ SIGNING_KEY: "from-keychain" }) });

  const composed: CredentialStore = {
    async resolve(ref) {
      for (const store of [environment, keychain]) {
        const value = await store.resolve(ref);
        if (value !== undefined) return value;
      }
      return undefined;
    },
  };

  assert.deepEqual(await composed.resolve(credentialRef("env", "KIE_API_KEY")), { secret: "from-env" });
  assert.deepEqual(await composed.resolve(credentialRef("keychain", "SIGNING_KEY")), { secret: "from-keychain" });
  // Because each store declines what is not addressed to it, order cannot
  // change the answer — the name decides, not the position.
  assert.equal(await composed.resolve(credentialRef("keychain", "KIE_API_KEY")), undefined);
  assert.equal(await composed.resolve(credentialRef("vault", "ANY")), undefined);
});
