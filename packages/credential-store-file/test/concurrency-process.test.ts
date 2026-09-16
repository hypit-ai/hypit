import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { credentialRef } from "@hypit/runtime";
import { FileCredentialStore } from "@hypit/credential-store-file";

const distribution = fileURLToPath(new URL("../../../", import.meta.url));
const storeUrl = pathToFileURL(join(distribution, "packages", "credential-store-file", "src", "index.ts")).href;

/**
 * One store write in its own process. `race` and `same-key` release only when every sibling has
 * arrived, so all writers enter their read-modify-write at the same instant; `repeat` rewrites one
 * key until it is done. Each writer reported success or the parent fails.
 */
const childSource = `
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [storeUrl, directory, key, secret, barrier, index, count, mode] = process.argv.slice(1);
const { FileCredentialStore } = await import(storeUrl);
const store = new FileCredentialStore({ path: directory });
if (mode === "repeat") {
  for (let step = 0; step < Number(count); step += 1) await store.put({ store: "file", key }, { secret: secret + "-" + step });
} else {
  mkdirSync(barrier, { recursive: true });
  writeFileSync(join(barrier, "ready." + index), "");
  while (readdirSync(barrier).filter((name) => name.startsWith("ready.")).length < Number(count)) {
    await new Promise((settle) => setTimeout(settle, 1));
  }
  await store.put({ store: "file", key }, { secret });
}
`;

function writeChild(arguments_: readonly string[]): Promise<void> {
  return new Promise((settled, failed) => {
    const child = spawn(process.execPath, [
      "--import", "tsx", "--input-type=module", "-e", childSource, ...arguments_,
    ], { cwd: distribution, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", failed);
    child.on("close", (code) => {
      if (code === 0) settled();
      else failed(new Error(`store writer exited ${code}: ${stderr}`));
    });
  });
}

async function scratchDirectory(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "hypit-file-race-")), "credentials");
}

test("simultaneous writers of different keys all keep their credential", async () => {
  const directory = await scratchDirectory();
  const rounds = 2;
  const writers = 3;
  for (let round = 0; round < rounds; round += 1) {
    const keys = Array.from({ length: writers }, (_, index) => `race.round-${round}.key-${index}`);
    const barrier = join(directory, "..", `barrier-${round}`);
    await Promise.all(keys.map(async (key, index) => await writeChild([
      storeUrl, directory, key, `value-${key}`, barrier, String(index), String(keys.length), "race",
    ])));
    const store = new FileCredentialStore({ path: directory });
    for (const key of keys) {
      assert.deepEqual(await store.resolve(credentialRef("file", key)), { secret: `value-${key}` },
        `key ${key} was erased by a simultaneous writer of another key`);
    }
  }
  const names = await readdir(directory);
  assert.equal(names.length, rounds * writers, `expected one document per credential, saw ${names.join(", ")}`);
  assert.deepEqual(names.filter((name) => name.startsWith(".")), [], "no temporary file survives a completed write");
  assert.deepEqual(await new FileCredentialStore({ path: directory }).diagnose(), []);
});

test("simultaneous writers of one key leave one complete document", async () => {
  const directory = await scratchDirectory();
  const key = "shared.key";
  const secrets = ["from-a", "from-b", "from-c"];
  const barrier = join(directory, "..", "barrier-shared");
  await Promise.all(secrets.map(async (secret, index) => await writeChild([
    storeUrl, directory, key, secret, barrier, String(index), String(secrets.length), "same-key",
  ])));

  const store = new FileCredentialStore({ path: directory });
  const resolved = await store.resolve(credentialRef("file", key));
  assert.ok(resolved !== undefined && secrets.includes(resolved.secret),
    `expected one writer's value, saw ${JSON.stringify(resolved)}`);
  assert.equal((await readdir(directory)).length, 1, "one key keeps exactly one document");
  assert.deepEqual(await store.diagnose(), []);
});

test("a reader always sees a whole document while another process rewrites it", async () => {
  const directory = await scratchDirectory();
  const key = "hot.key";
  const store = new FileCredentialStore({ path: directory });
  await store.put(credentialRef("file", key), { secret: "seed" });

  const writing = writeChild([storeUrl, directory, key, "hot", join(directory, "..", "unused"), "0", "40", "repeat"]);
  let reads = 0;
  while (reads < 200) {
    const value = await store.resolve(credentialRef("file", key));
    assert.notEqual(value, undefined, "a rewrite must never make the credential unreadable");
    reads += 1;
  }
  await writing;
  assert.equal(reads, 200);
  assert.equal((await readdir(directory)).length, 1, "writes replace the document instead of adding one");
});

test("a temporary document left by an interrupted writer is ignored", async () => {
  const directory = await scratchDirectory();
  const store = new FileCredentialStore({ path: directory });
  await store.put(credentialRef("file", "hypihub.oauth"), { secret: "value" });
  await writeFile(join(directory, ".0123456789abcdef.999.dead.tmp"), "{ half a doc", "utf8");
  await writeFile(join(directory, "notes.txt"), "not this store's business\n", "utf8");

  assert.deepEqual(await store.resolve(credentialRef("file", "hypihub.oauth")), { secret: "value" });
  assert.deepEqual(await store.diagnose(), []);
});
