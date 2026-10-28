import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { credentialRef } from "@hypit/runtime";
import { FileCredentialStore } from "../../src/file.js";

test("file credentials create private files and require an owner-private directory on POSIX", {
  skip: process.platform === "win32",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-file-credentials-"));
  try {
    const privateRoot = join(root, "private");
    const privateStore = new FileCredentialStore(privateRoot);
    await privateStore.put(credentialRef("file", "service"), { secret: "secret" });
    const [file] = await readdir(privateRoot);
    assert.equal((await stat(join(privateRoot, file!))).mode & 0o777, 0o600);

    await chmod(root, 0o755);
    const publicStore = new FileCredentialStore(root);
    await assert.rejects(publicStore.put(credentialRef("file", "other"), { secret: "secret" }), /owner-private/u);
    assert.deepEqual((await readdir(root)).sort(), ["private"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
