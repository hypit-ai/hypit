import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { FileResourceStore } from "@hypit/resource-store-fs";

test("cancelled stream writes remove only their unfinished file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-resources-abort-"));
  const controller = new AbortController();
  const store = new FileResourceStore(directory);
  try {
    const kept = await store.put(new Uint8Array([9]), "application/octet-stream");
    let closed = false;
    const chunks = (async function* () {
      try {
        yield new Uint8Array([1]);
        controller.abort(new Error("transfer stopped"));
        await delay(60_000, undefined, { signal: controller.signal });
      } finally { closed = true; }
    })();
    await assert.rejects(store.putStream(chunks, "application/octet-stream", { signal: controller.signal }));
    assert.equal(closed, true);
    assert.deepEqual(await readdir(join(directory, ".incoming")), []);
    assert.deepEqual(await readdir(join(directory, "resources")), [kept.resource]);
    assert.deepEqual(await store.get(kept.resource), new Uint8Array([9]));
    await assert.rejects(store.open(kept.resource, { signal: controller.signal }), /transfer stopped/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("filesystem resources are independent and survive adapter restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-resources-"));
  try {
    const bytes = new TextEncoder().encode("one immutable video artifact");
    const first = new FileResourceStore(directory);
    const left = await first.put(bytes, "video/mp4");
    const right = await first.put(bytes, "video/mp4");
    assert.notEqual(left.resource, right.resource);
    assert.equal(left.size, bytes.byteLength);

    const reopened = new FileResourceStore(directory);
    assert.equal(await reopened.has(left.resource), true);
    assert.deepEqual(await reopened.get(left.resource), bytes);

  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("filesystem resources stream writes and reads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-resources-stream-"));
  try {
    const store = new FileResourceStore(directory);
    const artifact = await store.putStream((async function* () {
      yield new TextEncoder().encode("streamed ");
      yield new TextEncoder().encode("artifact");
    })(), "application/octet-stream");
    const opened = await store.open(artifact.resource);
    assert.notEqual(opened, undefined);
    const values: number[] = [];
    for await (const chunk of opened!) values.push(...chunk);
    assert.equal(new TextDecoder().decode(Uint8Array.from(values)), "streamed artifact");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
