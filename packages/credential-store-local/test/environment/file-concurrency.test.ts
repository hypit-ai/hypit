import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, open, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { credentialRef } from "@hypit/runtime";
import { FileCredentialStore } from "../../src/file.js";

const distribution = fileURLToPath(new URL("../../../../", import.meta.url));
const fixture = fileURLToPath(new URL("../file-store-writer-fixture.ts", import.meta.url));
const writers = 8;

type Exit = { code: number; stderr: string };

/**
 * Place every credential from its own process, released at one shared instant. A Store that keeps
 * every key in one document reads the value it is about to replace, so simultaneous replacements
 * overwrite each other and the last writer's document wins; keeping the schedule spread out instead
 * would let that layout pass, which is why the barrier is the assertion.
 */
async function placeSimultaneously(directory: string, entries: { key: string; secret: string }[]): Promise<Exit[]> {
  const children = entries.map(({ key, secret }) => {
    const writer = spawn(process.execPath, ["--import", "tsx", fixture, directory, key, secret], {
      cwd: distribution, stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true,
    });
    let stderr = "";
    writer.stderr!.on("data", chunk => { stderr += String(chunk); });
    const ready = new Promise<void>((resolve, reject) => {
      writer.once("message", () => resolve());
      writer.once("error", reject);
      writer.once("close", () => reject(new Error(`writer exited before release: ${stderr}`)));
    });
    const exit = new Promise<Exit>((resolve, reject) => {
      writer.once("error", reject);
      writer.once("close", code => resolve({ code: code ?? 1, stderr }));
    });
    return { writer, ready, exit };
  });
  try {
    await Promise.all(children.map(child => child.ready));
    for (const child of children) child.writer.send("write");
    return await Promise.all(children.map(child => child.exit));
  } finally { for (const child of children) child.writer.kill(); }
}

test("processes placing different keys at one instant keep every credential", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-file-credentials-process-"));
  try {
    const directory = join(root, "private");
    const entries = Array.from({ length: writers }, (_, index) => ({
      key: `instance-${index}`, secret: `secret-${index}`,
    }));
    const exits = await placeSimultaneously(directory, entries);
    for (const [index, exit] of exits.entries()) {
      assert.equal(exit.code, 0, `writer ${index} failed: ${exit.stderr}`);
    }
    const store = new FileCredentialStore(directory);
    for (const { key, secret } of entries) {
      assert.deepEqual(await store.resolve(credentialRef("file", key)), { secret },
        `${key} was placed by a writer that completed without error, so it must still be readable`);
    }
    assert.deepEqual((await readdir(directory)).sort(), entries.map(({ key }) =>
      `key-${Buffer.from(key, "utf16le").toString("hex")}.json`).sort(),
    "each key owns its own document, with no temporary file left behind");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("two processes placing the same key leave one complete value", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-file-credentials-process-"));
  try {
    const directory = join(root, "private");
    const entries = [{ key: "shared", secret: "first" }, { key: "shared", secret: "second" }];
    const exits = await placeSimultaneously(directory, entries);
    for (const [index, exit] of exits.entries()) {
      assert.equal(exit.code, 0, `writer ${index} failed: ${exit.stderr}`);
    }
    // Which replacement lands last is the filesystem's business; that the value is one writer's
    // whole value, and never a mixture of the two, is this Store's.
    const resolved = await new FileCredentialStore(directory).resolve(credentialRef("file", "shared"));
    assert.ok(entries.some(entry => entry.secret === resolved?.secret), `expected one complete value, got ${JSON.stringify(resolved)}`);
    assert.equal((await readdir(directory)).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("a separate process replaces a credential while its previous document is open", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-file-credentials-reader-"));
  try {
    const store = new FileCredentialStore(directory);
    const ref = credentialRef("file", "shared");
    await store.put(ref, { secret: "old" });
    const [name] = await readdir(directory);
    const reader = await open(join(directory, name!), "r");
    try {
      const [exit] = await placeSimultaneously(directory, [{ key: "shared", secret: "new" }]);
      assert.equal(exit!.code, 0, exit!.stderr);
      assert.deepEqual(await store.resolve(ref), { secret: "new" });
      assert.deepEqual(JSON.parse(await reader.readFile("utf8")), { secret: "old" });
    } finally { await reader.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
