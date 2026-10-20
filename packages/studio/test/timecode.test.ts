import assert from "node:assert/strict";
import test from "node:test";
import { frameTimecode } from "../src/ui/timecode.js";

test("frame timecodes use the authored rational frame clock", () => {
  assert.equal(frameTimecode(30, { numerator: 30, denominator: 1 }), "00:01:00");
  assert.equal(frameTimecode(1018, { numerator: 30_000, denominator: 1_001 }), "00:33:28");
  assert.equal(frameTimecode(1019, { numerator: 30_000, denominator: 1_001 }), "00:34:00");
});

test("fractional-rate timecodes never step backwards", () => {
  for (const rate of [{ numerator: 30_000, denominator: 1_001 }, { numerator: 24_000, denominator: 1_001 }]) {
    let previous = "";
    for (let frame = 0; frame < 20_000; frame += 1) {
      const current = frameTimecode(frame, rate);
      assert.ok(current > previous, `${rate.numerator}/${rate.denominator} frame ${frame}: ${previous} -> ${current}`);
      previous = current;
    }
  }
});
