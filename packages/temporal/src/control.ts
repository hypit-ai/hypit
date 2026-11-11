import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalZero,
  subtractExactTemporalValues,
} from "./exact.js";
import { assertLocalTemporalDomain } from "./domain.js";
import { assertTemporalMap, evaluateTemporalMap } from "./map.js";

import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalControl,
  TemporalMap,
} from "./algebra-types.js";
import type { Rational } from "./rational.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id && compareExactTemporalValues(left.duration, right.duration) === 0;
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
  interpolate: (from: Value, to: Value, progress: Rational, interpolation: Interpolation) => Value,
): Value {
  assertTemporalControl(value, () => {}, () => {});
  assertExactTemporalValue(at, "Control position");
  assert(compareExactTemporalValues(at, exactTemporalZero()) >= 0
    && compareExactTemporalValues(at, value.domain.duration) < 0,
  `Control position lies outside domain ${value.domain.id}.`);
  const segment = value.segments.find((candidate) =>
    compareExactTemporalValues(at, candidate.range.start) >= 0
      && compareExactTemporalValues(at, candidate.range.end) < 0);
  assert(segment !== undefined, `Control ${value.domain.id} has no segment at the selected position.`);
  return interpolate(
    segment.from,
    segment.to,
    unitRatio(
      subtractExactTemporalValues(at, segment.range.start),
      subtractExactTemporalValues(segment.range.end, segment.range.start),
    ),
    segment.interpolation,
  );
}

export function assertTemporalControlMapping(
  controlDomain: LocalTemporalDomain,
  mapping: TemporalMap,
  programDomain: LocalTemporalDomain,
): void {
  assertTemporalMap(mapping);
  const first = mapping.stages[0];
  const last = mapping.stages.at(-1);
  assert(first !== undefined && sameDomain(first.target, programDomain),
    `Control Mapping must begin in Programme domain ${programDomain.id}.`);
  assert(last !== undefined && sameDomain(last.source, controlDomain),
    `Control Mapping must end in Control domain ${controlDomain.id}.`);
}

export function resolveTemporalControlPosition(
  controlDomain: LocalTemporalDomain,
  mapping: TemporalMap,
  programDomain: LocalTemporalDomain,
  at: ExactTemporalValue,
): ExactTemporalValue | undefined {
  assertTemporalControlMapping(controlDomain, mapping, programDomain);
  return evaluateTemporalMap(mapping, at, "after")?.position;
}
