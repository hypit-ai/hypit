import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { credentialRef } from "@hypit/runtime";
import { OsCredentialStore } from "../../src/os.js";

test("Windows locker replaces credentials and retains the previous value if replacement fails", {
  skip: process.platform !== "win32", timeout: 60_000,
}, async () => {
  const store = new OsCredentialStore({ service: `hypit-test-${randomUUID()}` });
  const ref = credentialRef("os", "replacement");
  try {
    await store.put(ref, { secret: "original" });
    await store.put(ref, { secret: "updated" });
    assert.deepEqual(await store.resolve(ref), { secret: "updated" });
    await assert.rejects(store.put(ref, { secret: "x".repeat(32_000) }));
    assert.deepEqual(await store.resolve(ref), { secret: "updated" });
    assert.equal(await store.delete(ref), true);
    assert.equal(await store.resolve(ref), undefined);
  } finally { await store.delete(ref); }
});
