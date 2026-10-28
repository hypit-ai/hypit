import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { credentialRef } from "@hypit/runtime";
import { FileCredentialStore } from "../../src/file.js";

test("a refused replacement preserves the old credential, cleans its temporary and reports the I/O error", { skip: process.platform === "win32" }, async t => {
  const root = await fs.mkdtemp(join(tmpdir(), "hypit-refused-credential-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new FileCredentialStore(root);
  const ref = credentialRef("file", "example");
  await store.put(ref, { secret: "original" });
  const before = await fs.readdir(root);
  const refusal = Object.assign(new Error("replacement refused"), { code: "EPERM", syscall: "rename" });
  const rename = t.mock.method(fs, "rename", async () => { throw refusal; });
  syncBuiltinESMExports();
  try {
    await assert.rejects(store.put(ref, { secret: "replacement" }), error => error === refusal);
    assert.deepEqual(await store.resolve(ref), { secret: "original" });
    assert.deepEqual(await fs.readdir(root), before);
  } finally { rename.mock.restore(); syncBuiltinESMExports(); }
  await store.put(ref, { secret: "next" });
  assert.deepEqual(await store.resolve(ref), { secret: "next" });
});


test("Windows refuses a read-only destination without deleting the old credential", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(join(tmpdir(), "hypit-refused-credential-"));
  const store = new FileCredentialStore(root);
  const ref = credentialRef("file", "example");
  await store.put(ref, { secret: "original" });
  const before = await fs.readdir(root);
  const path = join(root, before[0]!);
  try {
    await fs.chmod(path, 0o444);
    await assert.rejects(store.put(ref, { secret: "replacement" }), /Windows file replacement failed/u);
    assert.deepEqual(await store.resolve(ref), { secret: "original" });
    assert.deepEqual(await fs.readdir(root), before);
  } finally {
    await fs.chmod(path, 0o600);
    await fs.rm(root, { recursive: true, force: true });
  }
});
