import assert from "node:assert/strict";
import test from "node:test";

import { credentialRef } from "@hypit/runtime";
import { OsCredentialStore } from "@hypit/credential-store-os";

function memoryStore(entries: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(entries));
  return new OsCredentialStore({
    read: async (_service, account) => values.get(account),
    write: async (_service, account, secret) => { values.set(account, secret); },
    remove: async (_service, account) => values.delete(account),
  });
}

test("the OS store owns one logical name and is writable without exposing another store", async () => {
  const store = memoryStore({ "provider.api-key": "secret" });
  const ref = credentialRef("os", "provider.api-key");
  assert.deepEqual(await store.resolve(ref), { secret: "secret" });
  assert.equal(await store.resolve(credentialRef("env", "PROVIDER_KEY")), undefined);
  await store.put(ref, { secret: "replacement" });
  assert.deepEqual(await store.resolve(ref), { secret: "replacement" });
  assert.equal(await store.delete(ref), true);
  assert.equal(await store.resolve(ref), undefined);
});

test("malformed and foreign references are refused before the backend is touched", async () => {
  let reads = 0;
  const store = new OsCredentialStore({
    read: async () => { reads += 1; return "x"; },
    write: async () => {},
    remove: async () => false,
  });
  await assert.rejects(async () => await store.resolve({ store: "os", key: " " } as never));
  await assert.rejects(async () => await store.put(credentialRef("env", "PROVIDER_KEY"), { secret: "x" }));
  assert.equal(reads, 0);
});
