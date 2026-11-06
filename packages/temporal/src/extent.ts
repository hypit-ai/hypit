import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
} from "./exact.js";
import { exactTemporalValueFromDuration, resolveTemporalBoundary } from "./sampling.js";
import type { TemporalSamplingGrid } from "./sampling.js";
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

/** Project the exact scalar carried by an extent without introducing a Clock or sampling grid. */
export function exactTemporalValueFromExtent(extent: TemporalExtent): TemporalExtent["duration"] {
  assertTemporalExtent(extent);
  return structuredClone(extent.duration);
}

export function temporalExtentFromDuration(duration: TemporalDuration, grid: TemporalSamplingGrid): TemporalExtent {
  return sealTemporalExtent({ duration: exactTemporalValueFromDuration(duration, grid) });
}

export function resolveTemporalExtent(
  extent: TemporalExtent,
  grid: TemporalSamplingGrid,
  policy: TemporalBoundaryPolicy,
): number {
  assertTemporalExtent(extent);
  return resolveTemporalBoundary(extent.duration, grid, policy);
}
