import type { NarrativeSegmentRef, NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { projectDomainPosition } from "@hypit/temporal";
import type { LocalTemporalDomain, TemporalInstant, TemporalWindow } from "@hypit/temporal";
import { assertTimelineIdentity, timelineFrameCount } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

import {
  assertNarrativeAlignmentIdentity,
  assertNarrativeInstantSpecIdentity,
  assertNarrativeProjectionIdentity,
  assertNarrativeProjectionPartsIdentity,
} from "./identity.js";
import type { NarrativeAlignment, NarrativeInstantSpec, NarrativeProjection, ProjectedNarrativeAlignment } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function projectNarrativeAlignment(
  alignment: NarrativeAlignment,
  domain: LocalTemporalDomain,
  window: TemporalWindow,
  timeline: Timeline,
): ProjectedNarrativeAlignment {
  assertNarrativeAlignmentIdentity(alignment);
  assert(alignment.domainId === domain.id, "NarrativeAlignment and local temporal domain disagree.");
  return {
    narrativeId: alignment.narrativeId,
    timelineId: timeline.id,
    segment: structuredClone(alignment.segment),
    tokens: structuredClone(alignment.tokens),
    boundaries: alignment.boundaries.map((boundary) => ({
      id: boundary.id,
      frame: projectDomainPosition(domain, window, timeline, boundary.at),
    })),
  };
}

export function createNarrativeProjection(id: string, narrativeId: string, timeline: Timeline,
  parts: readonly ProjectedNarrativeAlignment[]): NarrativeProjection {
  assertTimelineIdentity(timeline);
  assert(id.length > 0 && narrativeId.length > 0, "NarrativeProjection identity is invalid.");
  assertNarrativeProjectionPartsIdentity({ parts });
  const boundaryIds = new Set<string>();
  const segmentIds = new Set<string>();
  const tokenIds = new Set<string>();
  for (const part of parts) {
    assert(part.narrativeId === narrativeId, "NarrativeProjection mixes Narratives.");
    assert(part.timelineId === timeline.id, "NarrativeProjection part uses another Timeline.");
    assert(!segmentIds.has(part.segment.segmentId), `NarrativeProjection repeats Segment ${part.segment.segmentId}.`);
    segmentIds.add(part.segment.segmentId);
    for (const token of part.tokens) {
      assert(!tokenIds.has(token.tokenId), `NarrativeProjection repeats Token ${token.tokenId}.`);
      tokenIds.add(token.tokenId);
    }
    for (const boundary of part.boundaries) {
      assert(!boundaryIds.has(boundary.id), `NarrativeProjection repeats Boundary ${boundary.id}.`);
      boundaryIds.add(boundary.id);
      assert(Number.isSafeInteger(boundary.frame) && boundary.frame >= 0
        && boundary.frame <= timelineFrameCount(timeline),
      `NarrativeProjection Boundary ${boundary.id} is outside Timeline.`);
    }
  }
  const projection = {
    id,
    narrativeId,
    timelineId: timeline.id,
    segments: parts.map((part) => structuredClone(part.segment)),
    tokens: parts.flatMap((part) => structuredClone(part.tokens)),
    boundaries: parts.flatMap((part) => structuredClone(part.boundaries)),
  };
  assertNarrativeProjectionIdentity(projection);
  return projection;
}

export function narrativeBoundaryFrame(projection: NarrativeProjection, boundaryId: string): number {
  const boundary = projection.boundaries.find((candidate) => candidate.id === boundaryId);
  if (boundary !== undefined) return boundary.frame;
  throw new Error(`NarrativeProjection ${projection.id} does not contain Boundary ${boundaryId}.`);
}

export function selectionFrameSpan(projection: NarrativeProjection, selection: NarrativeSelectionRef) {
  assert(selection.narrativeId === projection.narrativeId, `Selection ${selection.id} belongs to another Narrative.`);
  return { startFrame: narrativeBoundaryFrame(projection, selection.startAnchorId),
    endFrameExclusive: narrativeBoundaryFrame(projection, selection.endAnchorId) };
}

export function momentFrame(projection: NarrativeProjection, moment: NarrativeMomentRef): number {
  assert(moment.narrativeId === projection.narrativeId, `Moment ${moment.id} belongs to another Narrative.`);
  return narrativeBoundaryFrame(projection, moment.anchorId);
}

export function segmentFrameSpan(projection: NarrativeProjection, segment: NarrativeSegmentRef) {
  assert(segment.kind === "segment" && segment.narrativeId === projection.narrativeId,
    `Segment ${segment.id} belongs to another Narrative.`);
  const projected = projection.segments.find((candidate) => candidate.segmentId === segment.id);
  if (projected === undefined) throw new Error(`NarrativeProjection does not contain Segment ${segment.id}.`);
  return { startFrame: narrativeBoundaryFrame(projection, projected.startBoundaryId),
    endFrameExclusive: narrativeBoundaryFrame(projection, projected.endBoundaryId) };
}

export function tokenFrameSpan(projection: NarrativeProjection, tokenIds: readonly string[]) {
  if (tokenIds.length === 0) return undefined;
  const tokens = new Map(projection.tokens.map((token) => [token.tokenId, token] as const));
  const first = tokens.get(tokenIds[0]!);
  const last = tokens.get(tokenIds.at(-1)!);
  if (first === undefined || last === undefined || tokenIds.some((id) => !tokens.has(id))) return undefined;
  return { startFrame: narrativeBoundaryFrame(projection, first.startBoundaryId),
    endFrameExclusive: narrativeBoundaryFrame(projection, last.endBoundaryId) };
}

function narrativeBase(boundary: NarrativeInstantSpec["boundary"], projection: NarrativeProjection,
  source: NarrativeSelectionRef | NarrativeMomentRef | NarrativeSegmentRef, sourceKind: "selection" | "moment" | "segment"): number {
  if (sourceKind === "moment") {
    if (boundary !== "cue") throw new Error("A Narrative Moment only has a cue boundary.");
    return momentFrame(projection, source as NarrativeMomentRef);
  }
  if (boundary === "cue") throw new Error("A Narrative interval has start and end boundaries, not cue.");
  const span = sourceKind === "selection" ? selectionFrameSpan(projection, source as NarrativeSelectionRef)
    : segmentFrameSpan(projection, source as NarrativeSegmentRef);
  return boundary === "start" ? span.startFrame : span.endFrameExclusive;
}

export function projectNarrativeInstant(input: { readonly narrative: NarrativeProjection;
  readonly source: NarrativeSelectionRef | NarrativeMomentRef | NarrativeSegmentRef;
  readonly sourceKind: "selection" | "moment" | "segment"; readonly spec: NarrativeInstantSpec }): TemporalInstant {
  assertNarrativeProjectionIdentity(input.narrative);
  assertNarrativeInstantSpecIdentity(input.spec);
  const frame = narrativeBase(input.spec.boundary, input.narrative, input.source, input.sourceKind);
  assert(Number.isSafeInteger(frame) && frame >= 0, "Narrative projection frame is invalid.");
  return { id: input.spec.id, subjectId: input.spec.subjectId,
    timelineId: input.narrative.timelineId, frame };
}
