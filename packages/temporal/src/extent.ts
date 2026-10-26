import type { Clock } from "@hypit/timeline";

import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalValueFromDuration,
  exactTemporalZero,
  resolveTemporalBoundary,
} from "./exact.js";
import type {
  LocalTemporalDomain,
  TemporalBoundaryPolicy,
  TemporalDuration,
  TemporalExtent,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertTemporalExtent(value: TemporalExtent): void {
  assertExactTemporalValue(value.duration, "TemporalExtent.duration");
  assert(compareExactTemporalValues(value.duration, exactTemporalZero()) >= 0,
    "TemporalExtent.duration must be non-negative.");
}

export function sealTemporalExtent(value: TemporalExtent): TemporalExtent {
  assertTemporalExtent(value);
  return structuredClone(value);
}

export function temporalExtentFromDomain(domain: LocalTemporalDomain): TemporalExtent {
  return sealTemporalExtent({ duration: structuredClone(domain.duration) });
}

export function temporalExtentFromDuration(duration: TemporalDuration, clock: Clock): TemporalExtent {
  return sealTemporalExtent({ duration: exactTemporalValueFromDuration(duration, clock) });
}

export function resolveTemporalExtent(
  extent: TemporalExtent,
  clock: Clock,
  policy: TemporalBoundaryPolicy,
): number {
  assertTemporalExtent(extent);
  return resolveTemporalBoundary(extent.duration, clock, policy);
}
