import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  assertTemporalMap,
  compareExactTemporalValues,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalZero,
  subtractExactTemporalValues,
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
} from "@hypit/spatial/algebra";

import type {
  SpatialMapControl,
  SpatialMapInterpolation,
  TemporalControl,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameTemporalDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id
    && compareExactTemporalValues(left.duration, right.duration) === 0;
}

function contains(domain: LocalTemporalDomain, at: ExactTemporalValue): boolean {
  return compareExactTemporalValues(at, exactTemporalZero()) >= 0
    && compareExactTemporalValues(at, domain.duration) < 0;
}

function divisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function unitRatio(numerator: ExactTemporalValue, denominator: ExactTemporalValue): Rational {
  const left = exactTemporalRational(numerator);
  const right = exactTemporalRational(denominator);
  assert(right.numerator > 0n, "Control segment duration must be positive.");
  const rawNumerator = left.numerator * right.denominator;
  const rawDenominator = left.denominator * right.numerator;
  assert(rawNumerator >= 0n && rawNumerator <= rawDenominator,
    "Control interpolation progress lies outside [0, 1].");
  const common = divisor(rawNumerator, rawDenominator);
  return { numerator: rawNumerator / common, denominator: rawDenominator / common };
}

export function assertTemporalControl<Value, Interpolation>(
  value: TemporalControl<Value, Interpolation>,
  assertValue: (value: Value, label: string) => void,
  assertInterpolation: (value: Interpolation, label: string) => void,
): void {
  assertLocalTemporalDomain(value.domain);
  assert(value.segments.length > 0, `Control ${value.domain.id} has no segments.`);
  let cursor = exactTemporalZero();
  for (const [index, segment] of value.segments.entries()) {
    const label = `Control ${value.domain.id} segment ${index}`;
    assertExactTemporalValue(segment.range.start, `${label}.range.start`);
    assertExactTemporalValue(segment.range.end, `${label}.range.end`);
    assert(compareExactTemporalValues(segment.range.start, cursor) === 0,
      `${label} does not begin at the previous segment boundary.`);
    assert(compareExactTemporalValues(segment.range.start, segment.range.end) < 0,
      `${label} must be non-empty.`);
    assert(compareExactTemporalValues(segment.range.end, value.domain.duration) <= 0,
      `${label} exceeds Control domain ${value.domain.id}.`);
    assertValue(segment.from, `${label}.from`);
    assertValue(segment.to, `${label}.to`);
    assertInterpolation(segment.interpolation, `${label}.interpolation`);
    cursor = segment.range.end;
  }
  assert(compareExactTemporalValues(cursor, value.domain.duration) === 0,
    `Control ${value.domain.id} does not cover its complete domain.`);
}

export function evaluateTemporalControl<Value, Interpolation>(
  value: TemporalControl<Value, Interpolation>,
  at: ExactTemporalValue,
  interpolate: (
    from: Value,
    to: Value,
    progress: Rational,
    interpolation: Interpolation,
  ) => Value,
): Value {
  assertTemporalControl(value, () => {}, () => {});
  assertExactTemporalValue(at, "Control position");
  assert(contains(value.domain, at), `Control position lies outside domain ${value.domain.id}.`);
  const segment = value.segments.find((candidate) =>
    compareExactTemporalValues(at, candidate.range.start) >= 0
      && compareExactTemporalValues(at, candidate.range.end) < 0);
  assert(segment !== undefined, `Control ${value.domain.id} has no segment at the selected position.`);
  const progress = unitRatio(
    subtractExactTemporalValues(at, segment.range.start),
    subtractExactTemporalValues(segment.range.end, segment.range.start),
  );
  return interpolate(segment.from, segment.to, progress, segment.interpolation);
}

export function assertTemporalControlMapping(
  controlDomain: LocalTemporalDomain,
  mapping: TemporalMap,
  programDomain: LocalTemporalDomain,
): void {
  assertTemporalMap(mapping);
  const first = mapping.stages[0];
  const last = mapping.stages.at(-1);
  assert(first !== undefined && sameTemporalDomain(first.target, programDomain),
    `Control Mapping must begin in Programme domain ${programDomain.id}.`);
  assert(last !== undefined && sameTemporalDomain(last.source, controlDomain),
    `Control Mapping must end in Control domain ${controlDomain.id}.`);
}

export function resolveTemporalControlPosition(
  controlDomain: LocalTemporalDomain,
  mapping: TemporalMap,
  programDomain: LocalTemporalDomain,
  at: ExactTemporalValue,
): ExactTemporalValue | undefined {
  assertTemporalControlMapping(controlDomain, mapping, programDomain);
  const resolved = evaluateTemporalMap(mapping, at, "after");
  return resolved?.position;
}

function assertSpatialMapInterpolation(value: SpatialMapInterpolation, label: string): void {
  assert(value.kind === "affine-linear", `${label}.kind is invalid.`);
}

export function assertSpatialMapControl(value: SpatialMapControl): void {
  assertTemporalControl(value, (map, label) => {
    try { assertSpatialMap(map); } catch (error) {
      throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, assertSpatialMapInterpolation);
  const maps = value.segments.flatMap((segment) => [segment.from, segment.to]);
  const first = maps[0]!;
  for (const map of maps.slice(1)) {
    assert(sameSpatialDomain(map.target, first.target),
      `Spatial Map Control changes target domain ${first.target.id} to ${map.target.id}.`);
    assert(sameSpatialDomain(map.source, first.source),
      `Spatial Map Control changes source domain ${first.source.id} to ${map.source.id}.`);
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

export function evaluateSpatialMapControl(
  value: SpatialMapControl,
  at: ExactTemporalValue,
): SpatialMap {
  assertSpatialMapControl(value);
  return evaluateTemporalControl(value, at, (from, to, progress, interpolation) => {
    assertSpatialMapInterpolation(interpolation, "Spatial Map Control interpolation");
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
