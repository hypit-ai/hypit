import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  compareExactTemporalValues,
  exactTemporalZero,
  type ExactTemporalValue,
  type LocalTemporalDomain,
} from "@hypit/temporal/algebra";
import { resolveTemporalBoundary, type TemporalBoundaryPolicy } from "@hypit/temporal/sampling";
import { assertTemporalWindowFor, assertTimelineIdentity } from "@hypit/timeline";
import type { TemporalWindow, Timeline } from "@hypit/timeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertNarrativeDomainWindow(
  domain: LocalTemporalDomain,
  window: TemporalWindow,
  timeline: Timeline,
  policy: TemporalBoundaryPolicy = "cover",
): void {
  assertLocalTemporalDomain(domain);
  assertTimelineIdentity(timeline);
  assertTemporalWindowFor(window, { timeline });
  const frameCount = resolveTemporalBoundary(domain.duration, timeline, policy);
  assert(window.span.endFrameExclusive - window.span.startFrame === frameCount,
    `Window ${window.id} does not cover the complete narrative domain ${domain.id}.`);
}

export function projectNarrativeDomainPosition(
  domain: LocalTemporalDomain,
  window: TemporalWindow,
  timeline: Timeline,
  position: ExactTemporalValue,
  policy: TemporalBoundaryPolicy = "nearest",
): number {
  assertNarrativeDomainWindow(domain, window, timeline);
  assertExactTemporalValue(position, "Narrative domain position");
  assert(compareExactTemporalValues(position, exactTemporalZero()) >= 0
    && compareExactTemporalValues(position, domain.duration) <= 0,
  `Position lies outside narrative domain ${domain.id}.`);
  if (compareExactTemporalValues(position, domain.duration) === 0) return window.span.endFrameExclusive;
  return window.span.startFrame + resolveTemporalBoundary(position, timeline, policy);
}
