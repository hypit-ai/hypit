import assert from "node:assert/strict";
import test from "node:test";

import {
  CompositeCredentialStore,
  writableCredentialStore,
} from "@hypit/runtime";
import type {
  CredentialRef,
  CredentialValue,
  WritableCredentialStore,
} from "@hypit/runtime";

test("a composite exposes the same structural write capability as its selected owner", async () => {
  const values = new Map<string, CredentialValue>();
  const owner: WritableCredentialStore = {
    owns: (ref) => ref.store === "fixture",
    resolve: async (ref) => values.get(ref.key),
    put: async (ref, value) => { values.set(ref.key, value); },
    delete: async (ref) => values.delete(ref.key),
  };
  const composite = new CompositeCredentialStore([
    { resolve: async () => undefined },
    owner,
  ]);
  const ref: CredentialRef = { store: "fixture", key: "token" };

  const writable = await writableCredentialStore(composite, ref);
  assert.equal(writable, composite);
  await writable?.put(ref, { secret: "value" });
  assert.deepEqual(await composite.resolve(ref), { secret: "value" });
  assert.equal(await writable?.delete(ref), true);
});
