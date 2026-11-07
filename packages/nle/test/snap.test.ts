import assert from "node:assert/strict";
import test from "node:test";

import { snapNleTime, type NleSnapGuide } from "../src/index.js";

const at = (ticks: number, denominator: number) => ({
  ticks: String(ticks),
  timeBase: { numerator: 1, denominator },
});

test("snap guides resolve one UI gesture without quantizing exact time", () => {
  const guide: NleSnapGuide = { at: at(2, 5), kind: "media-marker", label: "Beat" };

  assert.deepEqual(snapNleTime(at(1, 3), [guide], 100), { at: at(2, 5), guide });
  assert.deepEqual(snapNleTime(at(1, 3), [guide], 200), { at: at(1, 3) });
  assert.deepEqual(snapNleTime(at(1, 3), [], 100), { at: at(1, 3) });
});

test("snap selects the exactly nearest guide and keeps first-guide precedence on a tie", () => {
  const guides: NleSnapGuide[] = [
    { at: at(1, 4), kind: "item-edge", label: "left" },
    { at: at(5, 12), kind: "item-edge", label: "right" },
  ];
  const result = snapNleTime(at(1, 3), guides, 10, 10);
  assert.deepEqual(result, { at: at(1, 4), guide: guides[0] });
});

test("snap rejects invalid viewport measurements", () => {
  assert.throws(() => snapNleTime(at(0, 1), [], 0), /pixelsPerSecond/u);
  assert.throws(() => snapNleTime(at(0, 1), [], 1, -1), /tolerancePixels/u);
});
