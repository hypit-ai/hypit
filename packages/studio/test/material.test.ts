import assert from "node:assert/strict";
import test from "node:test";
import { attachmentFile, bytesFile, materialBytes } from "../src/material.js";

test("preview registration does not open material, and byte ranges use the owning stream", async () => {
  let opened = 0;
  const ranges: unknown[] = [];
  const file = attachmentFile({
    blob: { kind: "blob", resource: "res_large", mediaType: "video/mp4", size: 4_000_000_000 },
    open() { opened++; throw new Error("full media must not be read"); },
    openRange(range) {
      ranges.push(range);
      return (async function* () { yield new Uint8Array([4, 5]); })();
    },
  });
  assert.equal(opened, 0);
  assert.equal(file.size, 4_000_000_000);
  const chunks = [];
  for await (const chunk of await file.open({ start: 3_000_000_000, endExclusive: 3_000_000_002 })) chunks.push(...chunk);
  assert.deepEqual(chunks, [4, 5]);
  assert.deepEqual(ranges, [{ start: 3_000_000_000, endExclusive: 3_000_000_002 }]);
  assert.equal(opened, 0);
});

test("sequential attachments stop and close after the requested range", async () => {
  let reads = 0;
  let closed = false;
  const file = attachmentFile({
    blob: { kind: "blob", resource: "res_stream", mediaType: "audio/wav", size: 9 },
    async *open() {
      try {
        for (const bytes of [[0, 1, 2], [3, 4, 5], [6, 7, 8]]) {
          reads++;
          yield new Uint8Array(bytes);
        }
      } finally { closed = true; }
    },
  });
  const chunks = [];
  for await (const chunk of await file.open({ start: 2, endExclusive: 5 })) chunks.push(...chunk);
  assert.deepEqual(chunks, [2, 3, 4]);
  assert.equal(reads, 2);
  assert.equal(closed, true);
});

test("generated material supports full reads and ranges without changing bytes", async () => {
  const file = bytesFile("image/png", new Uint8Array([1, 2, 3, 4]));
  const bytes = await materialBytes(file);
  bytes[0] = 99;
  assert.deepEqual(await materialBytes(file), new Uint8Array([1, 2, 3, 4]));
  const chunks = [];
  for await (const chunk of await file.open({ start: 1, endExclusive: 3 })) chunks.push(...chunk);
  assert.deepEqual(chunks, [2, 3]);
});

test("a truncated material stream reports a read error", async () => {
  const file = attachmentFile({
    blob: { kind: "blob", resource: "res_truncated", mediaType: "image/png", size: 3 },
    async *open() { yield new Uint8Array([1, 2]); },
  });
  await assert.rejects(materialBytes(file), /2 bytes, expected 3/);
});
