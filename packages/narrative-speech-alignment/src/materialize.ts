import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import { sealNarrativeAlignment } from "@hypit/narrative-temporal";
import type { NarrativeAlignment } from "@hypit/narrative-temporal";
import {
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalValue,
  resolveTemporalBoundary,
} from "@hypit/temporal";
import type { ExactTemporalValue, LocalTemporalDomain } from "@hypit/temporal";

import type { NarrativeAlignmentTiming } from "./types.js";

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

function localPosition(
  unit: number,
  timeBase: NarrativeAlignmentTiming["timeBase"],
  domain: LocalTemporalDomain,
  label: string,
): ExactTemporalValue {
  if (!Number.isSafeInteger(unit) || unit < 0) throw new Error(`${label} is not an exact local boundary.`);
  const at = exactTemporalValue({
    numerator: BigInt(unit) * BigInt(timeBase.numerator),
    denominator: BigInt(timeBase.denominator),
  });
  if (compareExactTemporalValues(at, domain.duration) <= 0) return at;
  const clock = { frameRate: { numerator: timeBase.denominator, denominator: timeBase.numerator } };
  if (unit === resolveTemporalBoundary(domain.duration, clock, "nearest")) return structuredClone(domain.duration);
  throw new Error(`${label} lies outside local domain ${domain.id}.`);
}

export function materializeNarrativeAlignment(narrative: Narrative, excerpt: NarrativeSegmentRef,
  domain: LocalTemporalDomain, timing: NarrativeAlignmentTiming): NarrativeAlignment {
  assertLocalTemporalDomain(domain);
  const segment = authoredSegment(narrative, excerpt);
  const timedById = new Map(timing.tokens.map((token) => [token.tokenId, token]));
  const tokens = narrative.tokens.slice(segment.tokenStart, segment.tokenEndExclusive).map((token) => {
    const timed = timedById.get(token.id);
    if (timed === undefined || timed.segmentId !== segment.id) throw new Error(`Semantic timing does not locate Token ${token.id}.`);
    const start = localPosition(timed.startUnit, timing.timeBase, domain, `Token ${token.id}`);
    const end = localPosition(timed.endUnitExclusive, timing.timeBase, domain, `Token ${token.id}`);
    if (compareExactTemporalValues(end, start) <= 0) throw new Error(`Token ${token.id} has an empty or reversed local window.`);
    return { tokenId: token.id, segmentId: segment.id, text: token.text,
      startBoundaryId: token.startAnchorId, endBoundaryId: token.endAnchorId };
  });
  const measuredById = new Map(timing.boundaries.map((boundary) => [boundary.id, boundary]));
  const boundaries = narrative.anchors.filter((anchor) => anchor.segmentId === segment.id).map((anchor) => {
    const measured = measuredById.get(anchor.id);
    if (measured === undefined) throw new Error(`Semantic timing does not locate Boundary ${anchor.id}.`);
    if (anchor.id === segment.endAnchorId) return { id: anchor.id, at: structuredClone(domain.duration) };
    return { id: anchor.id, at: localPosition(measured.unit, timing.timeBase, domain, `Boundary ${anchor.id}`) };
  });
  return sealNarrativeAlignment({ narrativeId: narrative.id, domainId: domain.id,
    segment: { segmentId: segment.id, startBoundaryId: segment.startAnchorId, endBoundaryId: segment.endAnchorId },
    tokens, boundaries }, domain);
}
