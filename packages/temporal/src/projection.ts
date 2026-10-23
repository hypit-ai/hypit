import { assertTimelineIdentity, timelineFrameCount } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

import { add, compare, durationInFrames, quantizeBoundary, rational } from "./rational.js";
import type { Rational } from "./rational.js";
import type {
  TemporalInstantExpression, TemporalInstant,
  TemporalInstantSpec, TemporalWindow, TemporalWindowSpec, WindowRelation,
  TemporalExtent, TemporalShiftSpec,
} from "./types.js";

export type TemporalConsumption = { readonly timeline?: Timeline };

export function assertTemporalInstantFor(instant: TemporalInstant, expected: TemporalConsumption): void {
  if (!instant.timelineId) throw new Error("Temporal Instant has no Timeline identity.");
  if (!Number.isSafeInteger(instant.frame) || instant.frame < 0) throw new Error("Temporal Instant frame is invalid.");
  if (expected.timeline !== undefined) {
    assertTimelineIdentity(expected.timeline);
    if (instant.timelineId !== expected.timeline.id) throw new Error("Temporal Instant belongs to a different Timeline.");
    if (instant.frame > timelineFrameCount(expected.timeline)) throw new Error("Temporal Instant falls outside its Timeline.");
  }
}

export function assertTemporalWindowFor(window: TemporalWindow, expected: TemporalConsumption): void {
  if (!window.subjectId) throw new Error("Temporal Window has no authored identity.");
  assertTemporalInstantFor(window.start, expected);
  assertTemporalInstantFor(window.end, expected);
  if (window.start.timelineId !== window.end.timelineId) throw new Error("Temporal Window endpoints belong to different Timelines.");
  if (window.span.startFrame !== window.start.frame || window.span.endFrameExclusive !== window.end.frame
    || window.span.endFrameExclusive <= window.span.startFrame) throw new Error("Temporal Window span disagrees with its endpoints.");
}

function evaluateProgramInstant(expression: TemporalInstantExpression, timeline: Timeline): Rational {
  if (expression.ref === "absolute") {
    const at = durationInFrames(expression.at, timeline);
    return expression.offset === undefined ? at : add(at, durationInFrames(expression.offset, timeline));
  }
  let base: number;
  if (expression.ref === "timeline.start") base = 0;
  else if (expression.ref === "timeline.end") base = timelineFrameCount(timeline);
  else throw new Error("Unsupported Timeline projection expression.");
  return expression.offset === undefined ? rational(BigInt(base))
    : add(rational(BigInt(base)), durationInFrames(expression.offset, timeline));
}

export function projectTemporalInstant(expression: TemporalInstantExpression, timeline: Timeline): number {
  assertTimelineIdentity(timeline);
  const totalFrames = timelineFrameCount(timeline);
  const raw = evaluateProgramInstant(expression, timeline);
  if (compare(raw, rational(0n)) < 0 || compare(raw, rational(BigInt(totalFrames))) > 0) {
    throw new Error("Temporal Instant projection falls outside Timeline.");
  }
  const frame = quantizeBoundary(raw);
  if (frame < 0 || frame > totalFrames) throw new Error("Temporal Instant projection quantizes outside Timeline.");
  return frame;
}

export function resolvedInstant(spec: Pick<TemporalInstantSpec, "id" | "subjectId">, timeline: Timeline, frame: number): TemporalInstant {
  if (spec.id.length === 0) throw new Error("Temporal Instant id must not be empty.");
  assertTimelineIdentity(timeline);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > timelineFrameCount(timeline)) {
    throw new Error("Temporal Instant falls outside Timeline.");
  }
  return { id: spec.id, subjectId: spec.subjectId, timelineId: timeline.id, frame };
}

export function projectProgramInstant(input: {
  readonly itemId: string; readonly subjectId: string; readonly timeline: Timeline;
  readonly projection: TemporalInstantExpression;
}): TemporalInstant {
  return resolvedInstant({ id: input.itemId, subjectId: input.subjectId }, input.timeline,
    projectTemporalInstant(input.projection, input.timeline));
}

export function shiftTemporalInstant(
  spec: TemporalShiftSpec,
  timeline: Timeline,
  base: TemporalInstant,
  extent: TemporalExtent,
): TemporalInstant {
  assertTimelineIdentity(timeline);
  assertTemporalInstantFor(base, { timeline });
  if (spec.id.length === 0 || spec.subjectId.length === 0) throw new Error("Temporal shift identity is invalid.");
  if (spec.direction !== 1 && spec.direction !== -1) throw new Error("Temporal shift direction is invalid.");
  if (extent.frameRate.numerator !== timeline.frameRate.numerator
    || extent.frameRate.denominator !== timeline.frameRate.denominator) {
    throw new Error("Temporal shift Extent uses another frame rate.");
  }
  if (!Number.isSafeInteger(extent.frameCount) || extent.frameCount < 0) {
    throw new Error("Temporal shift Extent is invalid.");
  }
  return resolvedInstant(spec, timeline, base.frame + spec.direction * extent.frameCount);
}

export function composeTemporalWindow(spec: TemporalWindowSpec, start: TemporalInstant, end: TemporalInstant): TemporalWindow {
  if (spec.id.length === 0) throw new Error("Temporal Window id must not be empty.");
  if (!spec.subjectId) throw new Error("Temporal Window subjectId must not be empty.");
  if (start.timelineId !== end.timelineId) throw new Error("Temporal Window endpoints must belong to one Timeline.");
  if (end.frame < start.frame) throw new Error("Temporal Window endpoints are reversed.");
  if (end.frame === start.frame) throw new Error("Temporal Window endpoints produce a zero window.");
  return { id: spec.id, subjectId: spec.subjectId, start: structuredClone(start), end: structuredClone(end),
    span: { startFrame: start.frame, endFrameExclusive: end.frame } };
}

export function assertWindowRelation(windows: readonly TemporalWindow[], relation: WindowRelation): readonly TemporalWindow[] {
  if (relation === "independent") return windows;
  const ordered = [...windows].sort((left, right) => left.span.startFrame - right.span.startFrame
    || left.span.endFrameExclusive - right.span.endFrameExclusive || left.id.localeCompare(right.id));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous !== undefined && current !== undefined && current.span.startFrame < previous.span.endFrameExclusive) {
      throw new Error(`Temporal windows ${previous.id} and ${current.id} overlap under disjoint policy.`);
    }
  }
  return windows;
}
