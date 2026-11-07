import assert from "node:assert/strict";
import test from "node:test";

import {
  createNarrativeLocalTiming,
  momentTemporalValue,
  selectionTemporalRange,
  tokenTemporalRange,
  type NarrativeAlignment,
} from "@hypit/narrative-temporal";
import { exactTemporalValueFromFrames } from "@hypit/temporal";

const clock = { frameRate: { numerator: 30, denominator: 1 } };
const at = (frame: number) => exactTemporalValueFromFrames(frame, clock);
const domain = { id: "speech-domain", duration: at(90) };

const alignment: NarrativeAlignment = {
  narrativeId: "story",
  domainId: domain.id,
  segment: { segmentId: "intro", startBoundaryId: "intro:start", endBoundaryId: "intro:end" },
  tokens: [{ tokenId: "hello", segmentId: "intro", text: "hello",
    startBoundaryId: "hello:start", endBoundaryId: "hello:end" }],
  boundaries: [
    { id: "intro:start", at: at(0) },
    { id: "hello:start", at: at(3) },
    { id: "hello:end", at: at(30) },
    { id: "intro:end", at: at(90) },
  ],
};

test("Narrative local timing keeps rational source time without Timeline or frame projection", () => {
  const timing = createNarrativeLocalTiming("story-time", "story", domain, [alignment]);
  assert.deepEqual(tokenTemporalRange(timing, ["hello"]), { start: at(3), end: at(30) });
  assert.deepEqual(selectionTemporalRange(timing, {
    id: "hello-selection", narrativeId: "story",
    startAnchorId: "hello:start", endAnchorId: "hello:end",
  }), { start: at(3), end: at(30) });
  assert.deepEqual(momentTemporalValue(timing, {
    id: "hello-moment", narrativeId: "story", anchorId: "hello:start",
  }), at(3));
  assert.equal("timelineId" in timing, false);
  assert.equal("frame" in timing.boundaries[0]!, false);
});

test("Narrative local timing rejects Alignments from another domain", () => {
  assert.throws(() => createNarrativeLocalTiming("story-time", "story", {
    id: "other-domain", duration: at(90),
  }, [alignment]), /another local domain/u);
});
