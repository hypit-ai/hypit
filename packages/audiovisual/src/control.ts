import {
  assertTemporalControl,
  assertTemporalControlMapping,
  evaluateTemporalControl,
  resolveTemporalControlPosition,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type Rational,
  type TemporalMap,
} from "@hypit/temporal/algebra";
import {
  assertSpatialMap,
  interpolateSpatialMaps,
  sameSpatialDomain,
  type LocalSpatialDomain,
  type SpatialMap,
} from "./spatial.js";
import type { SpatialMapControl, SpatialMapInterpolation } from "./types.js";

export {
  assertTemporalControl,
  assertTemporalControlMapping,
  evaluateTemporalControl,
  resolveTemporalControlPosition,
} from "@hypit/temporal/algebra";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertInterpolation(value: SpatialMapInterpolation, label: string): void {
  assert(value.kind === "affine-linear", `${label}.kind is invalid.`);
}

export function assertSpatialMapControl(value: SpatialMapControl): void {
  assertTemporalControl(value, (map, label) => {
    try { assertSpatialMap(map); } catch (error) {
      throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, assertInterpolation);
  const maps = value.segments.flatMap((segment) => [segment.from, segment.to]);
  const first = maps[0]!;
  for (const map of maps.slice(1)) {
    assert(sameSpatialDomain(map.target, first.target), "Spatial Map Control changes target domain.");
    assert(sameSpatialDomain(map.source, first.source), "Spatial Map Control changes source domain.");
  }
}

export function spatialMapControlDomains(value: SpatialMapControl): {
  readonly target: LocalSpatialDomain;
  readonly source: LocalSpatialDomain;
} {
  assertSpatialMapControl(value);
  const first = value.segments[0]!.from;
  return { target: structuredClone(first.target), source: structuredClone(first.source) };
}

function unitNumber(value: Rational): number {
  const scale = 1_000_000_000_000_000n;
  return Number(value.numerator * scale / value.denominator) / Number(scale);
}

export function evaluateSpatialMapControl(value: SpatialMapControl, at: ExactTemporalValue): SpatialMap {
  assertSpatialMapControl(value);
  return evaluateTemporalControl(value, at, (from, to, progress, interpolation) => {
    assertInterpolation(interpolation, "Spatial Map Control interpolation");
    return interpolateSpatialMaps(from, to, unitNumber(progress));
  });
}

export function evaluateMappedSpatialMapControl(
  value: SpatialMapControl,
  mapping: TemporalMap,
  programDomain: LocalTemporalDomain,
  at: ExactTemporalValue,
): SpatialMap | undefined {
  assertSpatialMapControl(value);
  const position = resolveTemporalControlPosition(value.domain, mapping, programDomain, at);
  return position === undefined ? undefined : evaluateSpatialMapControl(value, position);
}

export function sealSpatialMapControl(value: SpatialMapControl): SpatialMapControl {
  assertSpatialMapControl(value);
  return structuredClone(value);
}
