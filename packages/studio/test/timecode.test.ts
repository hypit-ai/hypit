import assert from "node:assert/strict";
import test from "node:test";
import { frameTimecode } from "../src/ui/timecode.js";

test("frame timecodes count frames within each second at integer rates", () => {
  const rate = { numerator: 30, denominator: 1 };
  assert.equal(frameTimecode(0, rate), "00:00:00");
  assert.equal(frameTimecode(29, rate), "00:00:29");
  assert.equal(frameTimecode(30, rate), "00:01:00");
  assert.equal(frameTimecode(1805, rate), "01:00:05");
});

test("frame timecodes never step backwards at NTSC rates", () => {
  for (const rate of [{ numerator: 30000, denominator: 1001 }, { numerator: 24000, denominator: 1001 }]) {
    let previous = "";
    for (let frame = 0; frame < 20_000; frame += 1) {
      const current = frameTimecode(frame, rate);
      assert.ok(current > previous, `${rate.numerator}/${rate.denominator} frame ${frame}: ${previous} -> ${current}`);
      previous = current;
    }
  }
  assert.equal(frameTimecode(1018, { numerator: 30000, denominator: 1001 }), "00:33:28");
  assert.equal(frameTimecode(1019, { numerator: 30000, denominator: 1001 }), "00:34:00");
});
