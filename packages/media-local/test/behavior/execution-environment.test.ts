import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MemoryResourceStore } from "@hypit/executor";

import { createMediaExecutionEnvironment } from "../../src/index.js";

test("direct local media execution shares its caller-supplied ResourceStore", async () => {
  const resources = new MemoryResourceStore();
  const environment = createMediaExecutionEnvironment(resources, {
    ffmpegPath: "/tools/ffmpeg",
    ffprobePath: "/tools/ffprobe",
    processTimeoutMs: 1234,
    maxProbeOutputBytes: 5678,
  });
  const authored = await resources.put(Uint8Array.from([1, 2, 3]), "application/octet-stream");
  assert.deepEqual(await environment.artifacts.get(authored), Uint8Array.from([1, 2, 3]));
  const opened = await environment.artifacts.open(authored);
  assert.ok(opened !== undefined);
  const chunks: number[] = [];
  for await (const chunk of opened) chunks.push(...chunk);
  assert.deepEqual(chunks, [1, 2, 3]);

  const directory = await mkdtemp(join(tmpdir(), "hypit-media-environment-"));
  try {
    const file = join(directory, "rendered.bin");
    await writeFile(file, Uint8Array.from([4, 5]));
    const rendered = await environment.artifacts.putFile(file, "application/octet-stream");
    assert.deepEqual(await resources.get(rendered.resource), Uint8Array.from([4, 5]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  assert.equal(environment.ffmpegPath, "/tools/ffmpeg");
  assert.equal(environment.ffprobePath, "/tools/ffprobe");
  assert.equal(environment.processTimeoutMs, 1234);
  assert.equal(environment.maxProbeOutputBytes, 5678);
});

test("direct local media execution rejects invalid process limits before running a tool", () => {
  assert.throws(() => createMediaExecutionEnvironment(new MemoryResourceStore(), {
    processTimeoutMs: 0,
  }), /processTimeoutMs must be a positive integer/u);
});
