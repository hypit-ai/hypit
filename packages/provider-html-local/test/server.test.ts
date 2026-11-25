import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { serveHtmlProgram } from "../src/server.js";

test("the capture server answers byte ranges as HTTP defines them", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-capture-server-"));
  await writeFile(join(root, "clip.mp4"), new Uint8Array(1_000).map((_, index) => index % 251));
  await writeFile(join(root, "empty.webp"), new Uint8Array());
  const server = await serveHtmlProgram(root);
  const get = async (path: string, range?: string) => {
    const response = await fetch(new URL(path, server.url), range === undefined ? {} : { headers: { range } });
    return { status: response.status, range: response.headers.get("content-range"), bytes: (await response.arrayBuffer()).byteLength };
  };
  try {
    assert.deepEqual(await get("clip.mp4"), { status: 200, range: null, bytes: 1_000 });
    assert.deepEqual(await get("clip.mp4", "bytes=0-499"), { status: 206, range: "bytes 0-499/1000", bytes: 500 });
    assert.deepEqual(await get("clip.mp4", "bytes=500-"), { status: 206, range: "bytes 500-999/1000", bytes: 500 });
    // A last position past the end is clamped; only a first position past the end is unsatisfiable.
    assert.deepEqual(await get("clip.mp4", "bytes=500-1499"), { status: 206, range: "bytes 500-999/1000", bytes: 500 });
    assert.deepEqual(await get("clip.mp4", "bytes=1000-"), { status: 416, range: "bytes */1000", bytes: 0 });
    assert.deepEqual(await get("clip.mp4", "bytes=600-500"), { status: 416, range: "bytes */1000", bytes: 0 });
    assert.deepEqual(await get("empty.webp"), { status: 200, range: null, bytes: 0 });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
