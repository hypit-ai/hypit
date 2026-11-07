import assert from "node:assert/strict";
import test from "node:test";

import type { CaptionDocument } from "@hypit/caption";
import { projectNarrativeCaptionTiming } from "@hypit/narrative-caption";
import type { NarrativeLocalTiming } from "@hypit/narrative-temporal";

const second = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } });

const document: CaptionDocument = {
  id: "captions",
  units: [{ id: "unit-one", wordIds: ["word-one"] }],
  words: [{ id: "word-one", unitId: "unit-one", text: "Hello", separatorBefore: "", attributes: [] }],
  cues: [{ id: "cue-one", unitIds: ["unit-one"] }],
};

const timing: NarrativeLocalTiming = {
  id: "story-time",
  narrativeId: "story",
  domain: { id: "media-local", duration: second("10") },
  segments: [{ segmentId: "line", startBoundaryId: "line:start", endBoundaryId: "line:end" }],
  tokens: [{ tokenId: "token-one", segmentId: "line", text: "Hello",
    startBoundaryId: "token:start", endBoundaryId: "token:end" }],
  boundaries: [
    { id: "line:start", at: second("0") },
    { id: "token:start", at: { ticks: "1", timeBase: { numerator: 1, denominator: 2 } } },
    { id: "token:end", at: { ticks: "5", timeBase: { numerator: 1, denominator: 4 } } },
    { id: "line:end", at: second("10") },
  ],
};

test("Narrative Caption produces exact source-local sided regions", () => {
  const result = projectNarrativeCaptionTiming(document, {
    id: "binding",
    narrativeId: "story",
    documentId: document.id,
    units: [{ unitId: "unit-one", sourceTokenIds: ["token-one"] }],
  }, timing);
  assert.deepEqual(result, {
    documentId: document.id,
    domain: timing.domain,
    units: [{ unitId: "unit-one", regions: [{
      start: { position: timing.boundaries[1]!.at, side: "after" },
      end: { position: timing.boundaries[2]!.at, side: "before" },
    }] }],
  });
  assert.equal("timelineId" in result, false);
});
