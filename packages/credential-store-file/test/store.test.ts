import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { credentialRef } from "@hypit/runtime";
import { isRuntimeAdapterHostFacet } from "@hypit/runtime-kit";
import type { RuntimeAdapterFactoryContext } from "@hypit/runtime-kit";
import { FileCredentialStore, fileCredentialDocumentFormat } from "@hypit/credential-store-file";
import hypitPackage from "../src/activation.js";

/** The store's own on-disk contract: the digest of the key names one document per credential. */
function documentName(key: string): string {
  return `${createHash("sha256").update(key, "utf8").digest("hex")}.json`;
}

function documentFor(key: string, secret: string): string {
  return `${JSON.stringify({ format: fileCredentialDocumentFormat, key, secret }, null, 2)}\n`;
}

async function scratchDirectory(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "hypit-file-credentials-")), "credentials");
}

async function entries(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).sort();
  } catch {
    return [];
  }
}

test("the file store owns one logical name and keeps one private document per key", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const oauth = credentialRef("file", "hypihub.oauth");

  assert.equal(await store.resolve(oauth), undefined);
  assert.equal(existsSync(directory), false, "reading must not create the store directory");
  await store.put(oauth, { secret: "first" });
  await store.put(credentialRef("file", "images.project"), { secret: "second" });
  assert.deepEqual(await store.resolve(oauth), { secret: "first" });
  assert.deepEqual(await store.resolve(credentialRef("file", "images.project")), { secret: "second" });
  assert.equal(await store.resolve(credentialRef("env", "hypihub.oauth")), undefined);
  assert.equal(await store.resolve(credentialRef("file", "hypihub.other")), undefined);
  assert.deepEqual(await entries(directory), [documentName("hypihub.oauth"), documentName("images.project")].sort());
  assert.deepEqual(JSON.parse(await readFile(join(directory, documentName("hypihub.oauth")), "utf8")), {
    format: fileCredentialDocumentFormat,
    key: "hypihub.oauth",
    secret: "first",
  });

  if (process.platform !== "win32") {
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    for (const name of await entries(directory)) {
      assert.equal((await stat(join(directory, name))).mode & 0o777, 0o600);
    }
    assert.deepEqual(await store.diagnose(), []);
  }

  assert.equal(await store.delete(oauth), true);
  assert.equal(await store.delete(oauth), false);
  assert.equal(await store.resolve(oauth), undefined);
  assert.deepEqual(await store.resolve(credentialRef("file", "images.project")), { secret: "second" });
});

test("malformed and foreign references are refused before any document is created", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  await assert.rejects(async () => await store.resolve({ store: "file", key: " " } as never));
  await assert.rejects(async () => await store.put(credentialRef("env", "PROVIDER_KEY"), { secret: "x" }));
  await assert.rejects(async () => await store.delete(credentialRef("os", "PROVIDER_KEY")));
  await assert.rejects(async () => await store.put(credentialRef("file", "key"), { secret: "" }));
  await assert.rejects(async () => await store.put(credentialRef("file", "./../escape"), { secret: "" }));
  assert.equal(existsSync(directory), false);
});

test("a key is data, never a path: odd and oversized keys stay inside the store directory", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const keys = [
    "../../escape", "/absolute", "a/b/c", ".", "..", "with space", "ünïcode-🔑",
    `long.${"k".repeat(500)}`, "quote\"and\\slash", "new\nline",
  ];
  for (const [index, key] of keys.entries()) await store.put(credentialRef("file", key), { secret: `secret-${index}` });
  for (const [index, key] of keys.entries()) {
    assert.deepEqual(await store.resolve(credentialRef("file", key)), { secret: `secret-${index}` });
  }
  assert.deepEqual(await entries(directory), keys.map(documentName).sort());
  assert.equal(existsSync(join(directory, "..", "escape")), false);
  assert.equal(existsSync(resolve(directory, "..", "..", "escape")), false);
  assert.deepEqual(await store.diagnose(), []);
});

test("secrets round-trip exactly, including JSON-hostile and large values", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const secrets = [
    "line\nbreak\ttab",
    "\"quoted\" \\ escaped 🔑",
    "x".repeat(200_000),
  ];
  for (const [index, secret] of secrets.entries()) {
    const ref = credentialRef("file", `secret.${index}`);
    await store.put(ref, { secret });
    assert.deepEqual(await store.resolve(ref), { secret });
  }
});

test("writing one key twice in a row keeps one document and no temporary file", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const ref = credentialRef("file", "hypihub.oauth");
  await store.put(ref, { secret: "first" });
  await store.put(ref, { secret: "second" });
  await store.put(ref, { secret: "second" });
  assert.deepEqual(await store.resolve(ref), { secret: "second" });
  assert.deepEqual(await entries(directory), [documentName("hypihub.oauth")]);
});

test("a truncated or corrupt document fails only its own key, and can be replaced or removed", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const broken = credentialRef("file", "hypihub.oauth");
  const healthy = credentialRef("file", "images.project");
  await store.put(healthy, { secret: "kept" });
  await writeFile(join(directory, documentName("hypihub.oauth")), documentFor("hypihub.oauth", "x").slice(0, 40), "utf8");

  await assert.rejects(async () => await store.resolve(broken), /is not valid JSON/u);
  // One damaged document must not hide or damage any other credential.
  assert.deepEqual(await store.resolve(healthy), { secret: "kept" });
  const unusable = (await store.diagnose()).filter((item) => item.severity === "error");
  assert.equal(unusable.length, 1);
  assert.equal(unusable[0]?.code, "FILE_CREDENTIAL_DOCUMENT_UNUSABLE");

  // Recovery through the real commands: login replaces the damaged document, logout removes it.
  await store.put(broken, { secret: "replacement" });
  assert.deepEqual(await store.resolve(broken), { secret: "replacement" });
  await writeFile(join(directory, documentName("hypihub.oauth")), "still not json\n", "utf8");
  assert.equal(await store.delete(broken), true);
  assert.equal(existsSync(join(directory, documentName("hypihub.oauth"))), false);

  await writeFile(join(directory, documentName("hypihub.oauth")), "{}\n", "utf8");
  await assert.rejects(async () => await store.resolve(broken), /does not declare format/u);
  await writeFile(join(directory, documentName("hypihub.oauth")), documentFor("someone.else", "x"), "utf8");
  await assert.rejects(async () => await store.resolve(broken), /belongs to another credential/u);
  const misplaced = (await store.diagnose()).filter((item) => item.code === "FILE_CREDENTIAL_DOCUMENT_MISPLACED");
  assert.equal(misplaced.length, 1);
});

test("a symbolic link at a document is replaced instead of written through", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const ref = credentialRef("file", "hypihub.oauth");
  const victim = join(directory, "victim.txt");
  await mkdir(directory, { recursive: true });
  await writeFile(victim, "untouched\n", "utf8");
  await symlink(victim, join(directory, documentName("hypihub.oauth")));

  await store.put(ref, { secret: "value" });
  assert.equal(await readFile(victim, "utf8"), "untouched\n");
  assert.equal((await stat(join(directory, documentName("hypihub.oauth")))).isFile(), true);
  assert.deepEqual(await store.resolve(ref), { secret: "value" });
});

test("a directory where a document belongs fails loudly for that key only", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const blocked = credentialRef("file", "hypihub.oauth");
  const healthy = credentialRef("file", "images.project");
  await store.put(healthy, { secret: "kept" });
  await mkdir(join(directory, documentName("hypihub.oauth")), { recursive: true });

  await assert.rejects(async () => await store.resolve(blocked), /cannot read/u);
  await assert.rejects(async () => await store.put(blocked, { secret: "x" }), /cannot write/u);
  await assert.rejects(async () => await store.delete(blocked), /cannot delete/u);
  assert.deepEqual(await store.resolve(healthy), { secret: "kept" });
  assert.ok((await store.diagnose()).some((item) => item.code === "FILE_CREDENTIAL_DOCUMENT_UNUSABLE"));
});

test("an unwritable store directory and an unreadable document report the store path", async () => {
  if (process.platform === "win32" || process.getuid?.() === 0) return;
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  const ref = credentialRef("file", "hypihub.oauth");
  await store.put(ref, { secret: "value" });

  await chmod(join(directory, documentName("hypihub.oauth")), 0o000);
  await assert.rejects(async () => await store.resolve(ref), /cannot read .*hypit-file-credentials-.*\.json$/u);
  assert.ok((await store.diagnose()).some((item) => item.code === "FILE_CREDENTIAL_DOCUMENT_UNUSABLE"));
  await chmod(join(directory, documentName("hypihub.oauth")), 0o600);

  await chmod(directory, 0o500);
  try {
    assert.deepEqual(await store.resolve(ref), { secret: "value" });
    await assert.rejects(async () => await store.put(credentialRef("file", "another"), { secret: "x" }), /cannot write/u);
  } finally {
    await chmod(directory, 0o700);
  }
  assert.equal(await store.delete(credentialRef("file", "absent")), false);
});

test("a path that is a file, not a directory, is reported rather than written", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "hypit-file-credentials-")), "credentials.json");
  await writeFile(path, "{}\n", "utf8");
  const store = new FileCredentialStore({ path });
  await assert.rejects(async () => await store.resolve(credentialRef("file", "key")), /cannot read/u);
  await assert.rejects(async () => await store.put(credentialRef("file", "key"), { secret: "x" }), /cannot write/u);
  assert.equal((await store.diagnose())[0]?.code, "FILE_CREDENTIAL_STORE_UNUSABLE");
  assert.equal(await readFile(path, "utf8"), "{}\n", "the foreign file is left alone");
});

test("an open document is reported, and a wider mode is not inherited by the next write", async () => {
  if (process.platform === "win32") return;
  const directory = await scratchDirectory();
  const ref = credentialRef("file", "hypihub.oauth");
  const store = new FileCredentialStore({ path: directory, platform: "linux" });
  await store.put(ref, { secret: "value" });
  const document = join(directory, documentName("hypihub.oauth"));
  await chmod(document, 0o644);
  await chmod(directory, 0o755);
  const reported = await store.diagnose();
  assert.deepEqual(reported.map((item) => item.code), [
    "FILE_CREDENTIAL_PERMISSIONS_OPEN",
    "FILE_CREDENTIAL_PERMISSIONS_OPEN",
  ]);

  await store.put(ref, { secret: "replacement" });
  assert.equal((await stat(document)).mode & 0o777, 0o600);
  assert.deepEqual((await store.diagnose()).map((item) => item.code), ["FILE_CREDENTIAL_PERMISSIONS_OPEN"]);
});

test("the adapter selects one directory under the Host state root and refuses other config", async () => {
  const facet = hypitPackage.hostFacets[0]!;
  assert.ok(isRuntimeAdapterHostFacet(facet));
  const implementation = facet.implementation as {
    validate(context: RuntimeAdapterFactoryContext): void;
    open(context: RuntimeAdapterFactoryContext): { readonly value: FileCredentialStore };
  };
  const context = (config: RuntimeAdapterFactoryContext["config"], hostStateRoot = "/host-state") =>
    ({ hostStateRoot, dataRoot: "/runtime-state", instance: "file", config }) as RuntimeAdapterFactoryContext;

  implementation.validate(context({}));
  assert.equal(implementation.open(context({})).value.path, join("/host-state", "credentials"));
  implementation.validate(context({ path: "vault/secrets" }));
  assert.equal(implementation.open(context({ path: "vault/secrets" })).value.path, resolve("/host-state", "vault/secrets"));
  assert.throws(() => implementation.validate(context({ path: "" })), /file credential path/u);
  assert.throws(() => implementation.validate(context({ service: "hypit" })), /does not accept service/u);
});
