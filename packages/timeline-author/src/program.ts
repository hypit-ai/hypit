import {
  composeTemporalWindow,
  durationInFrames,
  projectProgramInstant,
  resolveTemporalExtent,
} from "@hypit/temporal";
import type {
  TemporalBoundaryPolicy,
  TemporalExtent,
  TemporalDuration,
  TemporalInstant,
  TemporalWindow,
} from "@hypit/temporal";
import { assertClockIdentity, sealTimeline } from "@hypit/timeline";
import type { Clock, FrameSpan, Timeline } from "@hypit/timeline";

import type {
  ConstructionExtent,
  ConstructionIdentitySpec,
  ConstructionOffsetSpec,
  ConstructionPoint,
  TimelineAuthorHeader,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function identity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function constructionOrigin(clock: Clock): ConstructionPoint {
  assertClockIdentity(clock);
  return { frame: 0 };
}

export function constructionDuration(clock: Clock, duration: TemporalDuration): ConstructionExtent {
  assertClockIdentity(clock);
  const frames = durationInFrames(duration, clock);
  assert(frames.denominator === 1n && frames.numerator >= 0n
    && frames.numerator <= BigInt(Number.MAX_SAFE_INTEGER),
  "Timeline construction duration must resolve to a non-negative exact frame extent.");
  return { frameCount: Number(frames.numerator) };
}

export function constructionResolvedExtent(
  clock: Clock,
  extent: TemporalExtent,
  policy: TemporalBoundaryPolicy,
): ConstructionExtent {
  return { frameCount: resolveTemporalExtent(extent, clock, policy) };
}

export function constructionOffset(
  point: ConstructionPoint,
  extent: ConstructionExtent,
  spec: ConstructionOffsetSpec,
): ConstructionPoint {
  const frame = point.frame + spec.direction * extent.frameCount;
  assert(Number.isSafeInteger(frame) && frame >= 0, "Timeline construction Point resolves before start.");
  return { frame };
}

export function constructionLatest(left: ConstructionPoint, right: ConstructionPoint): ConstructionPoint {
  return { frame: Math.max(left.frame, right.frame) };
}

export function constructionEarliest(left: ConstructionPoint, right: ConstructionPoint): ConstructionPoint {
  return { frame: Math.min(left.frame, right.frame) };
}

export function constructionAliasPoint(point: ConstructionPoint): ConstructionPoint {
  return { frame: point.frame };
}

export function constructionSpan(start: ConstructionPoint, extent: ConstructionExtent): FrameSpan {
  assert(extent.frameCount > 0, "Timeline construction Span must be non-empty.");
  return { startFrame: start.frame, endFrameExclusive: start.frame + extent.frameCount };
}

export function constructionSpanEnding(end: ConstructionPoint, extent: ConstructionExtent): FrameSpan {
  assert(extent.frameCount > 0, "Timeline construction Span must be non-empty.");
  const startFrame = end.frame - extent.frameCount;
  assert(startFrame >= 0, "Timeline construction Span resolves before start.");
  return { startFrame, endFrameExclusive: end.frame };
}

export function constructionSpanBetween(start: ConstructionPoint, end: ConstructionPoint): FrameSpan {
  assert(end.frame > start.frame, "Timeline construction Span must be non-empty and ordered.");
  return { startFrame: start.frame, endFrameExclusive: end.frame };
}

export function constructionSpanStart(span: FrameSpan): ConstructionPoint {
  return { frame: span.startFrame };
}

export function constructionSpanEnd(span: FrameSpan): ConstructionPoint {
  return { frame: span.endFrameExclusive };
}

export function finalizeTimeline(header: TimelineAuthorHeader, clock: Clock, end: ConstructionPoint): Timeline {
  identity(header.id, "Timeline id");
  assertClockIdentity(clock);
  assert(Number.isSafeInteger(end.frame) && end.frame > 0, "Timeline end must be a positive frame boundary.");
  return sealTimeline({ id: header.id, frameRate: structuredClone(clock.frameRate), frameCount: end.frame });
}

export function materializeInstant(
  timeline: Timeline,
  point: ConstructionPoint,
  spec: ConstructionIdentitySpec,
): TemporalInstant {
  identity(spec.id, "Instant id");
  const subjectId = spec.subjectId ?? spec.id;
  identity(subjectId, "Instant subject id");
  return projectProgramInstant({
    itemId: spec.id,
    subjectId,
    timeline,
    projection: { ref: "absolute", at: { unit: "frames", value: point.frame } },
  });
}

export function materializeWindow(
  timeline: Timeline,
  span: FrameSpan,
  spec: ConstructionIdentitySpec,
): TemporalWindow {
  identity(spec.id, "Window id");
  return composeTemporalWindow(
    { id: spec.id, subjectId: spec.id },
    projectProgramInstant({ itemId: `${spec.id}.start`, subjectId: spec.id, timeline,
      projection: { ref: "absolute", at: { unit: "frames", value: span.startFrame } } }),
    projectProgramInstant({ itemId: `${spec.id}.end`, subjectId: spec.id, timeline,
      projection: { ref: "absolute", at: { unit: "frames", value: span.endFrameExclusive } } }),
  );
}
