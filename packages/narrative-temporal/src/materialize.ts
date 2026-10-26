import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import { assertLocalTemporalDomain, exactTemporalZero } from "@hypit/temporal";
import type { LocalTemporalDomain } from "@hypit/temporal";

import { sealNarrativeAlignment } from "./identity.js";
import type { NarrativeAlignment } from "./types.js";

function authoredSegment(narrative: Narrative, excerpt: NarrativeSegmentRef): Narrative["segments"][number] {
  if (narrative.id !== excerpt.narrativeId) throw new Error(`NarrativeSegmentRef ${excerpt.id} belongs to another Narrative.`);
  if (excerpt.kind !== "segment") throw new Error("NarrativeAlignment materialization requires a Segment excerpt.");
  const segment = narrative.segments.find((candidate) => candidate.id === excerpt.id);
  if (segment === undefined) throw new Error(`Narrative does not contain Segment ${excerpt.id}.`);
  if (excerpt.tokenStart !== segment.tokenStart || excerpt.tokenEndExclusive !== segment.tokenEndExclusive) {
    throw new Error(`NarrativeSegmentRef ${excerpt.id} does not describe its authored Segment.`);
  }
  return segment;
}

export function materializeSegmentBoundaryAlignment(
  narrative: Narrative,
  excerpt: NarrativeSegmentRef,
  domain: LocalTemporalDomain,
): NarrativeAlignment {
  assertLocalTemporalDomain(domain);
  const segment = authoredSegment(narrative, excerpt);
  if (segment.tokenStart !== segment.tokenEndExclusive) throw new Error(`Segment ${segment.id} contains Tokens and needs timing.`);
  return sealNarrativeAlignment({
    narrativeId: narrative.id,
    domainId: domain.id,
    segment: { segmentId: segment.id, startBoundaryId: segment.startAnchorId, endBoundaryId: segment.endAnchorId },
    tokens: [],
    boundaries: [
      { id: segment.startAnchorId, at: exactTemporalZero() },
      { id: segment.endAnchorId, at: structuredClone(domain.duration) },
    ],
  }, domain);
}
