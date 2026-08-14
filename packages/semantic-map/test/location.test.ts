import assert from "node:assert/strict";
import test from "node:test";

import { momentFrames, segmentFrameSpan, selectionFrameSpans } from "@narratage/semantic-map";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";

/**
 * Two Segments at 10 fps. Words are one frame wide with a one-frame gap, so a
 * boundary that snaps to the wrong side of a gap is visible as a whole frame,
 * and the two Segments are separated by a further frame of silence.
 *
 *   opening: hello[0..1)  end[2..3)      segment 0..4
 *   second:  start[5..6)  here[7..8)     segment 5..9
 */
const anchor = (identity: string, frame: number) => ({ identity, frame });

const map = {
  tokens: [],
  anchors: [
    anchor("segment:opening:start", 0),
    anchor("segment:opening:token:1:start", 0),
    anchor("segment:opening:token:1:end", 1),
    anchor("segment:opening:token:2:start", 2),
    anchor("segment:opening:token:2:end", 3),
    anchor("segment:opening:end", 4),
    anchor("segment:second:start", 5),
    anchor("segment:second:token:1:start", 5),
    anchor("segment:second:token:1:end", 6),
    anchor("segment:second:token:2:start", 7),
    anchor("segment:second:token:2:end", 8),
    anchor("segment:second:end", 9),
  ],
} as unknown as CompleteSemanticMap;

function selection(openAnchor: string, closeAnchor: string): NarrativeSelectionRef {
  return {

    id: "x",
    occurrences: [{
      occurrence: 0,
      startAnchorId: openAnchor,
      endAnchorId: closeAnchor,
    }],
  } as NarrativeSelectionRef;
}

test("the default inward markers select exactly the marked word", () => {
  // `@x end @/x` resolved at parse time to token 2's own cuts.
  assert.deepEqual(
    selectionFrameSpans(map, selection("segment:opening:token:2:start", "segment:opening:token:2:end")),
    [{ startFrame: 2, endFrameExclusive: 3 }],
  );
});

test("outward markers absorb the surrounding silence, not the neighbouring word", () => {
  // `hello ~@x end @/x~ …` resolves to hello's END and the next word's START.
  assert.deepEqual(
    selectionFrameSpans(map, selection("segment:opening:token:1:end", "segment:opening:token:2:start")),
    [{ startFrame: 1, endFrameExclusive: 2 }],
  );
});

test("a Segment cut is an ordinary anchor, so a Selection may start at one", () => {
  // `</opening><second> ~@x start …` — the left boundary is `second`'s own start
  // cut, five frames after `opening` ended, never `opening`'s last word.
  assert.deepEqual(
    selectionFrameSpans(map, selection("segment:second:start", "segment:second:token:1:end")),
    [{ startFrame: 5, endFrameExclusive: 6 }],
  );
  assert.deepEqual(
    selectionFrameSpans(map, selection("segment:second:token:2:start", "segment:second:end")),
    [{ startFrame: 7, endFrameExclusive: 9 }],
  );
});

test("a whole Segment is exactly its two structural anchors", () => {
  assert.deepEqual(segmentFrameSpan(map, {
    kind: "segment", id: "second", tokenStart: 2, tokenEndExclusive: 4,
  }), { startFrame: 5, endFrameExclusive: 9 });
});

test("a Moment locates one instant per occurrence", () => {
  const moment = {

    id: "reveal",
    occurrences: [
      { occurrence: 0, anchorId: "segment:second:start" },
      { occurrence: 1, anchorId: "segment:second:token:2:start" },
    ],
  } as NarrativeMomentRef;
  assert.deepEqual(momentFrames(map, moment), [5, 7]);
});

test("an anchor the map does not contain names the Selection that asked for it", () => {
  assert.throws(
    () => selectionFrameSpans(map, selection("segment:missing:start", "segment:second:end")),
    /NarrativeSelection x names anchor segment:missing:start/u,
  );
});

test("overlapping occurrences pass through untouched, in Script order", () => {
  // `@beat one @/beat … @beat three @/beat` where the two Segments overlap in
  // time. Locating never sorts, merges or clips occurrences against each other:
  // reconciling them is the caller's decision about its own material.
  const overlapping = {

    id: "beat",
    occurrences: [
      {
        occurrence: 0,
        startAnchorId: "segment:opening:token:1:start",
        endAnchorId: "segment:opening:end",
      },
      {
        occurrence: 1,
        startAnchorId: "segment:second:token:1:end",
        endAnchorId: "segment:second:end",
      },
    ],
  } as NarrativeSelectionRef;
  // opening:token1:start = 0, opening:end = 4, second:token1:end = 6, second:end = 9
  assert.deepEqual(selectionFrameSpans(map, overlapping), [
    { startFrame: 0, endFrameExclusive: 4 },
    { startFrame: 6, endFrameExclusive: 9 },
  ]);
});

test("Script order is preserved even when it runs backwards in time", () => {
  // Overlapping Segments make the second occurrence start before the first ends.
  // The array still follows the Script; a caller that needs time order sorts.
  const crossing = {

    id: "beat",
    occurrences: [
      {
        occurrence: 0,
        startAnchorId: "segment:second:token:1:start",
        endAnchorId: "segment:second:end",
      },
      {
        occurrence: 1,
        startAnchorId: "segment:opening:token:1:start",
        endAnchorId: "segment:opening:end",
      },
    ],
  } as NarrativeSelectionRef;
  assert.deepEqual(selectionFrameSpans(map, crossing), [
    { startFrame: 5, endFrameExclusive: 9 },
    { startFrame: 0, endFrameExclusive: 4 },
  ]);
});
