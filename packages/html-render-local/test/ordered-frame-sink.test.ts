import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import test from "node:test";

import { OrderedFrameSink } from "../src/ordered-frame-sink.js";

const bytes = (value: number, length = 1) => new Uint8Array(length).fill(value);

test("ordered sink lets the missing frontier pass a full future-frame budget", async () => {
  const written: number[] = [];
  let closed = false;
  const sink = new OrderedFrameSink({ frameCount: 5, maxPendingBytes: 2,
    writer: {
      write: async (frame) => { written.push(frame[0]!); },
      close: async () => { closed = true; },
    },
  });

  await Promise.all([sink.submit(2, bytes(2)), sink.submit(3, bytes(3))]);
  let admitted = false;
  const later = sink.submit(4, bytes(4)).then(() => { admitted = true; });
  await turn();
  assert.equal(admitted, false, "a future frame must stop when the byte budget is full");

  await sink.submit(0, bytes(0));
  assert.deepEqual(written, [0], "the required frontier must pass even while future frames fill the budget");
  await sink.submit(1, bytes(1));
  await later;
  await sink.close();

  assert.deepEqual(written, [0, 1, 2, 3, 4]);
  assert.equal(closed, true);
});

test("ordered sink accepts one oversized future frame without disabling its byte bound", async () => {
  const written: number[] = [];
  const sink = new OrderedFrameSink({ frameCount: 3, maxPendingBytes: 2,
    writer: { write: async (frame) => { written.push(frame[0]!); }, close: async () => {} },
  });

  await sink.submit(1, bytes(1, 8));
  let admitted = false;
  const last = sink.submit(2, bytes(2)).then(() => { admitted = true; });
  await turn();
  assert.equal(admitted, false, "only one oversized future frame may occupy an empty waiting set");
  await sink.submit(0, bytes(0));
  await last;
  await sink.close();
  assert.deepEqual(written, [0, 1, 2]);
});

test("ordered sink rejects every blocked producer after its writer fails", async () => {
  const failure = new Error("encoder stopped");
  const sink = new OrderedFrameSink({ frameCount: 4, maxPendingBytes: 1,
    writer: { write: async () => { throw failure; }, close: async () => {} },
  });
  await sink.submit(2, bytes(2));
  const blocked = sink.submit(3, bytes(3));
  await assert.rejects(sink.submit(0, bytes(0)), /encoder stopped/u);
  await assert.rejects(blocked, /encoder stopped/u);
});
