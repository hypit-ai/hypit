import type {
  NarrativeMomentRef,
  NarrativeSegmentRef,
  NarrativeSelectionRef,
} from "@hypit/narrative";
import {
  assertLocalTemporalDomain,
  compareExactTemporalValues,
} from "@hypit/temporal";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalRange,
} from "@hypit/temporal";

import {
  assertNarrativeAlignmentIdentity,
  assertNarrativeLocalTimingIdentity,
} from "./identity.js";
import type {
  NarrativeAlignment,
  NarrativeLocalTiming,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function createNarrativeLocalTiming(
  id: string,
  narrativeId: string,
  domain: LocalTemporalDomain,
  alignments: readonly NarrativeAlignment[],
): NarrativeLocalTiming {
  assert(id.trim().length > 0 && narrativeId.trim().length > 0,
    "NarrativeLocalTiming identity is invalid.");
  assertLocalTemporalDomain(domain);
  assert(alignments.length > 0, "NarrativeLocalTiming requires at least one Alignment.");
  for (const alignment of alignments) {
    assertNarrativeAlignmentIdentity(alignment, domain);
    assert(alignment.narrativeId === narrativeId,
      "NarrativeLocalTiming mixes Narratives.");
  }
  const value: NarrativeLocalTiming = {
    id,
    narrativeId,
    domain: structuredClone(domain),
    segments: alignments.map((alignment) => structuredClone(alignment.segment)),
    tokens: alignments.flatMap((alignment) => structuredClone(alignment.tokens)),
    boundaries: alignments.flatMap((alignment) => structuredClone(alignment.boundaries)),
  };
  assertNarrativeLocalTimingIdentity(value);
  return value;
}

export function narrativeBoundaryTime(
  timing: NarrativeLocalTiming,
  boundaryId: string,
): ExactTemporalValue {
  assertNarrativeLocalTimingIdentity(timing);
  const boundary = timing.boundaries.find((candidate) => candidate.id === boundaryId);
  if (boundary !== undefined) return structuredClone(boundary.at);
  throw new Error(`NarrativeLocalTiming ${timing.id} does not contain Boundary ${boundaryId}.`);
}

function range(
  timing: NarrativeLocalTiming,
  startBoundaryId: string,
  endBoundaryId: string,
  label: string,
): TemporalRange {
  const start = narrativeBoundaryTime(timing, startBoundaryId);
  const end = narrativeBoundaryTime(timing, endBoundaryId);
  assert(compareExactTemporalValues(start, end) <= 0, `${label} is reversed.`);
  return { start, end };
}

export function selectionTemporalRange(
  timing: NarrativeLocalTiming,
  selection: NarrativeSelectionRef,
): TemporalRange {
  assert(selection.narrativeId === timing.narrativeId,
    `Selection ${selection.id} belongs to another Narrative.`);
  return range(timing, selection.startAnchorId, selection.endAnchorId,
    `Selection ${selection.id}`);
}

export function momentTemporalValue(
  timing: NarrativeLocalTiming,
  moment: NarrativeMomentRef,
): ExactTemporalValue {
  assert(moment.narrativeId === timing.narrativeId,
    `Moment ${moment.id} belongs to another Narrative.`);
  return narrativeBoundaryTime(timing, moment.anchorId);
}

export function segmentTemporalRange(
  timing: NarrativeLocalTiming,
  segment: NarrativeSegmentRef,
): TemporalRange {
  assert(segment.kind === "segment" && segment.narrativeId === timing.narrativeId,
    `Segment ${segment.id} belongs to another Narrative.`);
  const located = timing.segments.find((candidate) => candidate.segmentId === segment.id);
  if (located === undefined) throw new Error(`NarrativeLocalTiming does not contain Segment ${segment.id}.`);
  return range(timing, located.startBoundaryId, located.endBoundaryId,
    `Segment ${segment.id}`);
}

export function tokenTemporalRange(
  timing: NarrativeLocalTiming,
  tokenIds: readonly string[],
): TemporalRange | undefined {
  assertNarrativeLocalTimingIdentity(timing);
  if (tokenIds.length === 0) return undefined;
  const tokens = new Map(timing.tokens.map((token) => [token.tokenId, token] as const));
  const first = tokens.get(tokenIds[0]!);
  const last = tokens.get(tokenIds.at(-1)!);
  if (first === undefined || last === undefined || tokenIds.some((id) => !tokens.has(id))) return undefined;
  return range(timing, first.startBoundaryId, last.endBoundaryId,
    `Token range ${tokenIds.join(", ")}`);
}
