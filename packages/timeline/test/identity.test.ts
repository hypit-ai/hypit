import assert from "node:assert/strict";
import test from "node:test";

import { assertFrameSpan, clockFrameSpanSamples } from "../src/index.js";

test("FrameSpan owns the common finite half-open frame interval", () => {
  assert.doesNotThrow(() => assertFrameSpan({ startFrame: 0, endFrameExclusive: 1 }, 1));
  assert.throws(() => assertFrameSpan({ startFrame: 1, endFrameExclusive: 1 }), /Frame span/u);
  assert.throws(() => assertFrameSpan({ startFrame: 1, endFrameExclusive: 3 }, 2), /Frame span/u);
});

test("one Clock quantizes a selected FrameSpan without borrowing another signal's length", () => {
  assert.deepEqual(clockFrameSpanSamples(
    { startFrame: 1, endFrameExclusive: 2 },
    { frameRate: { numerator: 30_000, denominator: 1_001 } },
    48_000,
  ), { startSample: 1_602, endSampleExclusive: 3_204, sampleFrames: 1_602 });
});
