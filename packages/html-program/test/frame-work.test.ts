import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";

import { frameWorkIndexRuntime } from "../src/frame-work.js";

test("render-local frame selection uses compact absolute spans and defaults to the whole document", () => {
  const context: { result?: boolean[] } = {};
  runInNewContext(`${frameWorkIndexRuntime}
    htmlPrepareFrameSelection([
      { startFrame: 10, endFrameExclusive: 20 },
      { startFrame: 40, endFrameExclusive: 41 },
    ]);
    result = [
      htmlSelectionOverlaps(0, 10),
      htmlSelectionOverlaps(9, 11),
      htmlSelectionOverlaps(20, 40),
      htmlSelectionOverlaps(40, 41),
      htmlSelectionOverlaps(41, 50),
    ];`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), [false, true, false, true, false]);

  const unrestricted: { result?: boolean } = {};
  runInNewContext(`${frameWorkIndexRuntime}\nresult = htmlSelectionOverlaps(100, 200);`, unrestricted);
  assert.equal(unrestricted.result, true);
  assert.throws(() => runInNewContext(`${frameWorkIndexRuntime}
    htmlPrepareFrameSelection([
      { startFrame: 5, endFrameExclusive: 10 },
      { startFrame: 4, endFrameExclusive: 6 },
    ]);`), /ordered, disjoint/u);
});

test("page-local frame work lookup preserves half-open spans and stable order", () => {
  const context: {
    entries: object[];
    queryFrames: number[];
    result?: string[][];
  } = {
    entries: [
      { startFrame: 5, endFrameExclusive: 10, order: 2, payload: "late" },
      { startFrame: 0, endFrameExclusive: 5, order: 0, payload: "early" },
      { startFrame: 3, endFrameExclusive: 8, order: 1, payload: "overlap-a" },
      { startFrame: 3, endFrameExclusive: 8, order: 1, payload: "overlap-b" },
      { startFrame: 100, endFrameExclusive: 102, order: 3, payload: "distant" },
    ],
    queryFrames: [0, 3, 4, 5, 7, 8, 100, 101, 102, 6],
  };
  runInNewContext(`${frameWorkIndexRuntime}
    const index = htmlCreateFrameWorkIndex(entries);
    result = queryFrames.map((frame) => index.at(frame).map((entry) => entry.payload));`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), [
    ["early"],
    ["early", "overlap-a", "overlap-b"],
    ["early", "overlap-a", "overlap-b"],
    ["overlap-a", "overlap-b", "late"],
    ["overlap-a", "overlap-b", "late"],
    ["late"],
    ["distant"],
    ["distant"],
    [],
    ["overlap-a", "overlap-b", "late"],
  ]);
});

test("page-local frame work lookup returns only spans overlapping an arbitrary range", () => {
  const context: { result?: string[][] } = {};
  runInNewContext(`${frameWorkIndexRuntime}
    const index = htmlCreateFrameWorkIndex([
      { startFrame: 0, endFrameExclusive: 5, order: 0, payload: 'early' },
      { startFrame: 3, endFrameExclusive: 8, order: 1, payload: 'overlap' },
      { startFrame: 8, endFrameExclusive: 10, order: 2, payload: 'adjacent' },
      { startFrame: 100, endFrameExclusive: 102, order: 3, payload: 'distant' },
    ]);
    result = [
      index.overlapping({ startFrame: 5, endFrameExclusive: 8 }).map(entry => entry.payload),
      index.overlapping({ startFrame: 8, endFrameExclusive: 9 }).map(entry => entry.payload),
      index.overlapping({ startFrame: 4, endFrameExclusive: 101 }).map(entry => entry.payload),
    ];`, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), [
    ["overlap"],
    ["adjacent"],
    ["early", "overlap", "adjacent", "distant"],
  ]);
});

test("frame work lookup rejects invalid spans and query frames", () => {
  const evaluate = (entries: object[], frame = 0): unknown => {
    const context: { entries: object[]; frame: number; result?: unknown } = { entries, frame };
    return assert.throws(() => runInNewContext(`${frameWorkIndexRuntime}
      result = htmlCreateFrameWorkIndex(entries).at(frame);`, context));
  };
  evaluate([{ startFrame: 2, endFrameExclusive: 2, payload: null }]);
  evaluate([{ startFrame: 0, endFrameExclusive: 1, order: 0, payload: null }], -1);
  assert.throws(() => runInNewContext(`${frameWorkIndexRuntime}
    htmlCreateFrameWorkIndex([]).overlapping({ startFrame: 2, endFrameExclusive: 2 });`));
});
