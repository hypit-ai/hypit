import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { credentialRef } from "@hypit/execution-environment";
import { FileCredentialStore } from "@hypit/credential-store-local";
import { OsCredentialStore } from "@hypit/credential-store-local";
import { LocalCredentialStore } from "@hypit/credential-store-local";

/** A locker that keeps entries in memory, so a platform's locker is exercised without touching one. */
function memoryLocker(entries: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    read: async (_service: string, account: string) => values.get(account),
    write: async (_service: string, account: string, secret: string) => { values.set(account, secret); },
    remove: async (_service: string, account: string) => values.delete(account),
    entries: values,
  };
}

async function scratch(prefix: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

test("macOS stores credentials in its locker and never creates a file", async () => {
  const root = await scratch("hypit-platform-credentials-");
  try {
    const directory = join(root, "credentials");
    const locker = memoryLocker();
    const store = new LocalCredentialStore({ directory, platform: "darwin", locker });
    const ref = credentialRef("local", "hypihub.oauth");
    assert.equal(await store.resolve(ref), undefined);
    await store.put(ref, { secret: "locker-secret" });
    assert.deepEqual(await store.resolve(ref), { secret: "locker-secret" });
    assert.equal(locker.entries.get("hypihub.oauth"), "locker-secret");
    assert.equal(await store.delete(ref), true);
    assert.equal(await store.resolve(ref), undefined);
    assert.deepEqual(await readdir(root), [], "file storage stays untouched by the OS policy");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Windows selects the locker as well", async () => {
  const root = await scratch("hypit-platform-credentials-");
  try {
    const locker = memoryLocker();
    const store = new LocalCredentialStore({
      directory: join(root, "credentials"), platform: "win32", locker,
    });
    await store.put(credentialRef("local", "hypihub.oauth"), { secret: "locker-secret" });
    assert.equal(locker.entries.get("hypihub.oauth"), "locker-secret");
    assert.deepEqual(await readdir(root), [], "file storage stays untouched by the OS policy");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Linux stores owner-private documents in the file Store's directory", async () => {
  const root = await scratch("hypit-platform-credentials-");
  try {
    const directory = join(root, "credentials");
    const store = new LocalCredentialStore({ directory, platform: "linux" });
    const ref = credentialRef("local", "hypihub.oauth");
    await store.put(ref, { secret: "file-secret", expiresAt: 42 });
    assert.deepEqual(await store.resolve(ref), { secret: "file-secret", expiresAt: 42 });
    const files = await readdir(directory);
    assert.deepEqual(files, [`key-${Buffer.from("hypihub.oauth", "utf16le").toString("hex")}.json`]);
    if (process.platform !== "win32") {
      assert.equal((await stat(join(directory, files[0]!))).mode & 0o777, 0o600);
    }
    assert.equal(await store.delete(ref), true);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("switching between this Store and the file Store finds the same credential", async () => {
  const root = await scratch("hypit-platform-credentials-");
  try {
    const directory = join(root, "credentials");
    await new FileCredentialStore(directory).put(credentialRef("file", "hypihub.oauth"), { secret: "written-by-file" });
    const platform = new LocalCredentialStore({ directory, platform: "linux" });
    assert.deepEqual(await platform.resolve(credentialRef("local", "hypihub.oauth")), { secret: "written-by-file" });
    await platform.put(credentialRef("local", "second"), { secret: "written-by-platform" });
    assert.deepEqual(await new FileCredentialStore(directory).resolve(credentialRef("file", "second")),
      { secret: "written-by-platform" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("only this Store owns the name local, and it owns no other name", async () => {
  const root = await scratch("hypit-platform-credentials-");
  try {
    const directory = join(root, "credentials");
    const platform = new LocalCredentialStore({ directory, platform: "linux" });
    const ref = credentialRef("local", "hypihub.oauth");
    assert.equal(await platform.resolve(credentialRef("file", "hypihub.oauth")), undefined,
      "a ref filed under another name is not this Store's to answer");
    await assert.rejects(platform.put(credentialRef("env", "HYPIHUB_OAUTH"), { secret: "x" }), /does not own env/u);
    await assert.rejects(platform.delete(credentialRef("os", "hypihub.oauth")), /does not own os/u);
    assert.equal(new FileCredentialStore(directory).owns(ref), false);
    assert.equal(new OsCredentialStore(memoryLocker()).owns(ref), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("unsupported platforms fail before creating credential files", async () => {
  const root = await scratch("hypit-platform-credentials-");
  try {
    assert.throws(() => new LocalCredentialStore({
      directory: join(root, "credentials"), platform: "freebsd",
    }), /Local CredentialStore cannot use the system credential locker on freebsd/u);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("locker failures propagate without switching to file storage", async () => {
  const root = await scratch("hypit-platform-credentials-");
  try {
    const failure = new Error("locker unavailable");
    const fail = async () => { throw failure; };
    const store = new LocalCredentialStore({
      directory: join(root, "credentials"), platform: "darwin",
      locker: { read: fail, write: fail, remove: fail },
    });
    const ref = credentialRef("local", "hypihub.oauth");
    await assert.rejects(store.resolve(ref), (error) => error === failure);
    await assert.rejects(store.put(ref, { secret: "not-written" }), (error) => error === failure);
    await assert.rejects(store.delete(ref), (error) => error === failure);
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});
