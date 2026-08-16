import assert from "node:assert/strict";
import test from "node:test";

import { credentialRef } from "@narratage/runtime";

import { KeychainCredentialStore } from "@narratage/credential-store-keychain";

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
  await assert.rejects(async () => await store.resolve({ format: "narratage.credential-ref@1", store: "keychain", key: " " } as never));
  assert.equal(asked, 0);
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
