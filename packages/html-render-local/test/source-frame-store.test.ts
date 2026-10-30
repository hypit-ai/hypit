import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import test from "node:test";

import { SourceFrameStore } from "../src/source-frame-store.js";

const window = (startFrame: number, endFrameExclusive: number) => ({ source: "video", startFrame, endFrameExclusive });

test("source frame store leases exact capture inputs and reuses bounded batch prefetch", async () => {
  const decodes: Array<{ startFrame: number; endFrameExclusive: number }> = [];
  const removed: string[] = [];
  const store = new SourceFrameStore({ maxBytes: 4,
    decode: async function* (_source, span) {
      decodes.push(span);
      for (let frame = span.startFrame; frame < span.endFrameExclusive; frame++) {
        yield { frame, path: `/video/${frame}.png`, bytes: 1 };
      }
    },
    remove: async path => { removed.push(path); },
  });

  const first = await store.acquire([window(0, 1)], [window(0, 4)]);
  while (store.residentBytes < 4) await turn();
  assert.deepEqual(decodes, [{ startFrame: 0, endFrameExclusive: 4 }]);
  assert.equal(store.residentBytes, 4);
  assert.equal(store.decodedBytes, 4);
  assert.equal(store.largestDecodedFrameBytes, 1);
  first.release();

  const reused = await store.acquire([window(2, 3)]);
  reused.release();
  assert.equal(decodes.length, 1, "a prefetched frame must not start another decoder");

  const next = await store.acquire([window(4, 5)]);
  next.release();
  assert.equal(decodes.length, 2);
  assert.equal(store.residentBytes, 4);
  assert.equal(removed.length, 1, "only enough least-recently-used data is evicted to admit the required frame");
  await store.close();
});

test("source frame store waits for live screenshots and lets one oversized requirement proceed alone", async () => {
  const decodes: number[][] = [];
  const store = new SourceFrameStore({ maxBytes: 2,
    decode: async function* (_source, span) {
      const frames = Array.from({ length: span.endFrameExclusive - span.startFrame },
        (_, offset) => span.startFrame + offset);
      decodes.push(frames);
      for (const frame of frames) yield { frame, path: `/video/${frame}.png`, bytes: 1 };
    },
    remove: async () => {},
  });

  const active = await store.acquire([window(0, 2)]);
  let admitted = false;
  const waiting = store.acquire([window(2, 3)]).then(lease => { admitted = true; return lease; });
  await turn();
  assert.equal(admitted, false);
  active.release();
  const next = await waiting;
  next.release();

  const oversized = await store.acquire([window(3, 6)]);
  assert.equal(store.residentBytes, 3);
  assert.equal(store.peakResidentBytes, 3);
  oversized.release();
  assert.deepEqual(decodes, [[0, 1], [2], [3, 4, 5]]);
  await store.close();
});

test("source frame store does not replace another live screenshot's remaining prefetch with soft data", async () => {
  const store = new SourceFrameStore({ maxBytes: 3,
    decode: async function* (_source, span) {
      for (let frame = span.startFrame; frame < span.endFrameExclusive; frame++) {
        yield { frame, path: `/video/${frame}.png`, bytes: 1 };
      }
    },
    remove: async () => {},
  });

  const first = await store.acquire([window(0, 1)], [window(0, 3)]);
  while (store.path("video", 2) === undefined) await turn();
  const second = await store.acquire([window(10, 11)], [window(10, 13)]);
  while (store.decodedFrames < 5) await turn();
  assert.notEqual(store.path("video", 2), undefined,
    "soft decoding must not evict an active Worker's still-relevant prefetch");
  assert.equal(store.path("video", 11), undefined,
    "soft decoding stops when only another active preference could make room");
  first.release();
  second.release();
  await store.close();
});

test("source frame store propagates one decoder failure to queued acquisitions", async () => {
  const store = new SourceFrameStore({ maxBytes: 2,
    decode: async function* () { throw new Error("source decoder failed"); }, remove: async () => {},
  });
  const first = store.acquire([window(0, 1)]);
  const second = store.acquire([window(1, 2)]);
  await assert.rejects(first, /source decoder failed/u);
  await assert.rejects(second, /source decoder failed/u);
  await store.close();
});
