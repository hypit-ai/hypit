import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileResourceStore } from "@hypit/resource-store-fs";

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
