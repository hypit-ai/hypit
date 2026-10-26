import assert from "node:assert/strict";
import test from "node:test";

import { assertNarrativeAlignmentIdentity } from "@hypit/narrative-temporal";
import { exactTemporalValueFromFrames } from "@hypit/temporal";

const clock = { frameRate: { numerator: 30, denominator: 1 } };
const at = (frame: number) => exactTemporalValueFromFrames(frame, clock);
const domain = { id: "speech-domain", duration: at(30) };

test("NarrativeAlignment uses one canonical coordinate per named boundary", () => {
  const alignment = {
    narrativeId: "story", domainId: domain.id,
    segment: { segmentId: "intro", startBoundaryId: "intro:start", endBoundaryId: "intro:end" },
    tokens: [{ tokenId: "hello", segmentId: "intro", text: "hello", startBoundaryId: "hello:start", endBoundaryId: "hello:end" }],
    boundaries: [
      { id: "intro:start", at: at(0) }, { id: "hello:start", at: at(3) },
      { id: "hello:end", at: at(10) }, { id: "intro:end", at: at(30) },
    ],
  };
  assert.doesNotThrow(() => assertNarrativeAlignmentIdentity(alignment, domain));
  assert.throws(() => assertNarrativeAlignmentIdentity({ ...alignment,
    boundaries: [...alignment.boundaries, { id: "hello:start", at: at(4) }] }, domain), /boundary hello:start is invalid/u);
  assert.throws(() => assertNarrativeAlignmentIdentity({ ...alignment,
    boundaries: alignment.boundaries.filter((boundary) => boundary.id !== "hello:end") }, domain), /Token hello is invalid/u);
});
