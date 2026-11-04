import { resolveTemporalBoundary, durationInFrames } from "@hypit/temporal/sampling";
import type { Rational } from "@hypit/temporal/algebra";
import type { TemporalExtent } from "@hypit/temporal";
import {
  assertTemporalInstantFor,
  assertTimelineIdentity,
  resolvedInstant,
  timelineFrameCount,
} from "@hypit/timeline";
import type { TemporalInstant, Timeline } from "@hypit/timeline";

import type { TimelineInstantExpression, TimelineInstantSpec, TimelineShiftSpec } from "./types.js";
import { assertTimelineInstantExpression, assertTimelineInstantSpec, assertTimelineShiftSpec } from "./legacy-validation.js";

const rational = (numerator: bigint, denominator = 1n): Rational => ({ numerator, denominator });
const add = (left: Rational, right: Rational): Rational => ({
  numerator: left.numerator * right.denominator + right.numerator * left.denominator,
  denominator: left.denominator * right.denominator,
});
const compare = (left: Rational, right: Rational): number => {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};
const quantize = (value: Rational): number => {
  if (value.numerator < 0n) throw new Error("Cannot quantize a negative Timeline boundary.");
  const rounded = (value.numerator * 2n + value.denominator) / (value.denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Timeline boundary exceeds safe frame arithmetic.");
  return Number(rounded);
};

function evaluate(expression: TimelineInstantExpression, timeline: Timeline): Rational {
  if (expression.ref === "absolute") {
    const at = durationInFrames(expression.at, timeline);
    return expression.offset === undefined ? at : add(at, durationInFrames(expression.offset, timeline));
  }
  const base = expression.ref === "timeline.start" ? 0 : timelineFrameCount(timeline);
  return expression.offset === undefined ? rational(BigInt(base))
    : add(rational(BigInt(base)), durationInFrames(expression.offset, timeline));
}

export function projectTimelineBoundary(expression: TimelineInstantExpression, timeline: Timeline): number {
  assertTimelineInstantExpression(expression);
  assertTimelineIdentity(timeline);
  const totalFrames = timelineFrameCount(timeline);
  const raw = evaluate(expression, timeline);
  if (compare(raw, rational(0n)) < 0 || compare(raw, rational(BigInt(totalFrames))) > 0) {
    throw new Error("Timeline Instant projection falls outside Timeline.");
  }
  const frame = quantize(raw);
  if (frame < 0 || frame > totalFrames) throw new Error("Timeline Instant projection quantizes outside Timeline.");
  return frame;
}

export function projectTimelineInstant(input: {
  readonly itemId: string;
  readonly subjectId: string;
  readonly timeline: Timeline;
  readonly projection: TimelineInstantExpression;
}): TemporalInstant {
  assertTimelineInstantSpec({ id: input.itemId, subjectId: input.subjectId, projection: input.projection });
  return resolvedInstant({ id: input.itemId, subjectId: input.subjectId }, input.timeline,
    projectTimelineBoundary(input.projection, input.timeline));
}

export function shiftTimelineInstant(
  spec: TimelineShiftSpec,
  timeline: Timeline,
  base: TemporalInstant,
  extent: TemporalExtent,
): TemporalInstant {
  assertTimelineShiftSpec(spec);
  assertTimelineIdentity(timeline);
  assertTemporalInstantFor(base, { timeline });
  const frameCount = resolveTemporalBoundary(extent.duration, timeline, spec.resolution ?? "cover");
  return resolvedInstant(spec, timeline, base.frame + spec.direction * frameCount);
}
