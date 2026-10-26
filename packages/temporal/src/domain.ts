import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  resolveTemporalBoundary,
} from "./exact.js";
import { assertTemporalWindowFor } from "./projection.js";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalBoundaryPolicy,
  TemporalWindow,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

export function sealLocalTemporalDomain(value: LocalTemporalDomain): LocalTemporalDomain {
  assertLocalTemporalDomain(value);
  return structuredClone(value);
}

export function assertLocalTemporalDomain(value: LocalTemporalDomain): void {
  assertIdentity(value.id, "LocalTemporalDomain.id");
  assertExactTemporalValue(value.duration, "LocalTemporalDomain.duration");
  assert(compareExactTemporalValues(value.duration, exactTemporalZero()) > 0,
    "LocalTemporalDomain.duration must be positive.");
}

/**
 * Verify that one complete local domain owns the supplied Window. The default
 * cover rule keeps the final partial output frame instead of truncating media.
 */
export function assertDomainWindow(
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
    `Window ${window.id} does not cover the complete local temporal domain ${domain.id}.`);
}

/** Resolve one exact local boundary after the domain has been explicitly placed. */
export function projectDomainPosition(
  domain: LocalTemporalDomain,
  window: TemporalWindow,
  timeline: Timeline,
  position: ExactTemporalValue,
  policy: TemporalBoundaryPolicy = "nearest",
): number {
  assertDomainWindow(domain, window, timeline);
  assertExactTemporalValue(position, "Local temporal position");
  assert(compareExactTemporalValues(position, exactTemporalZero()) >= 0
    && compareExactTemporalValues(position, domain.duration) <= 0,
  `Local position lies outside local temporal domain ${domain.id}.`);
  if (compareExactTemporalValues(position, domain.duration) === 0) return window.span.endFrameExclusive;
  return window.span.startFrame + resolveTemporalBoundary(position, timeline, policy);
}
