import assert from "node:assert/strict";
import test from "node:test";

import { FrameSpanIndex } from "../src/frame-span-index.js";

test("frame span lookup is absolute, half-open and preserves source order", () => {
  const values = [
    { startFrame: 5, endFrameExclusive: 10, id: "late" },
    { startFrame: 0, endFrameExclusive: 5, id: "early" },
    { startFrame: 3, endFrameExclusive: 8, id: "overlap-a" },
    { startFrame: 3, endFrameExclusive: 8, id: "overlap-b" },
    { startFrame: 100, endFrameExclusive: 102, id: "distant" },
  ];
  const index = new FrameSpanIndex(values);
  const ids = (frame: number) => index.at(frame).map((value) => value.id);
  assert.deepEqual(ids(0), ["early"]);
  assert.deepEqual(ids(5), ["late", "overlap-a", "overlap-b"]);
  assert.deepEqual(ids(8), ["late"]);
  assert.deepEqual(ids(102), []);
  // Queries have no cursor: reverse and distant access return the same facts.
  assert.deepEqual(ids(101), ["distant"]);
  assert.deepEqual(ids(3), ["early", "overlap-a", "overlap-b"]);
  assert.deepEqual(ids(101), ["distant"]);
});

test("range lookup returns only intersecting half-open spans", () => {
  const index = new FrameSpanIndex([
    { startFrame: 0, endFrameExclusive: 3, id: "before" },
    { startFrame: 3, endFrameExclusive: 8, id: "first" },
    { startFrame: 6, endFrameExclusive: 9, id: "second" },
    { startFrame: 9, endFrameExclusive: 12, id: "after" },
  ]);
  assert.deepEqual(index.overlapping({ startFrame: 3, endFrameExclusive: 9 }).map((value) => value.id),
    ["first", "second"]);
  assert.deepEqual(index.overlapping({ startFrame: 8, endFrameExclusive: 9 }).map((value) => value.id),
    ["second"]);
});

test("frame span lookup rejects invalid entries and queries", () => {
  assert.throws(() => new FrameSpanIndex([{ startFrame: 2, endFrameExclusive: 2 }]), /entry is invalid/u);
  const index = new FrameSpanIndex([{ startFrame: 0, endFrameExclusive: 1 }]);
  assert.throws(() => index.at(-1), /query is invalid/u);
  assert.throws(() => index.overlapping({ startFrame: 1, endFrameExclusive: 1 }), /entry is invalid/u);
});
