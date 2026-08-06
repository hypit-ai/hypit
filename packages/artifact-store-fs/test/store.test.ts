import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FileArtifactStore } from "@svml/artifact-store-fs";

test("filesystem artifacts are content-addressed and survive adapter restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-artifacts-"));
  try {
    const bytes = new TextEncoder().encode("one immutable video artifact");
    const first = new FileArtifactStore(directory);
    const left = await first.put(bytes, "video/mp4");
    const right = await first.put(bytes, "video/mp4");
    assert.equal(left.digest, right.digest);
    assert.equal(left.size, bytes.byteLength);

    const reopened = new FileArtifactStore(directory);
    assert.equal(await reopened.has(left.digest), true);
    assert.deepEqual(await reopened.get(left.digest), bytes);

    const hex = left.digest.slice("sha256:".length);
    await writeFile(join(directory, "sha256", hex.slice(0, 2), hex), "tampered");
    await assert.rejects(reopened.get(left.digest), /content digest differs/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
