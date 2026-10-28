import {
  exactTemporalRational,
  exactTemporalValue,
} from "./exact.js";
import { sealLocalTemporalDomain } from "./domain.js";
import { sealTemporalMap } from "./map.js";
import { add, compare, divide, multiply, rational, subtract } from "./rational.js";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
  TemporalMapPiece,
  TemporalRate,
} from "./types.js";

/** Pure constructor input; resolved Maps retain only integrated source positions. */
export type TemporalRateProfileKnot = {
  readonly sourceAt: ExactTemporalValue;
  readonly rate: TemporalRate;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rate(value: TemporalRate, label: string) {
  assert(Number.isSafeInteger(value.numerator), `${label}.numerator must be a safe integer.`);
  assert(Number.isSafeInteger(value.denominator) && value.denominator > 0,
    `${label}.denominator must be a positive safe integer.`);
  return rational(BigInt(value.numerator), BigInt(value.denominator));
}

/**
 * Integrate a piecewise-linear signed rate profile into one exact target-to-source Map.
 * Each adjacent knot pair owns one source interval. Its target duration is derived from
 * that interval and the two endpoint rates, so no output duration is guessed or sampled.
 */
export function integrateTemporalRateProfile(input: {
  readonly targetId: string;
  readonly source: LocalTemporalDomain;
  readonly knots: readonly TemporalRateProfileKnot[];
}): TemporalMap {
  assert(input.knots.length >= 2, "Temporal rate profile requires at least two knots.");
  const three = rational(3n);
  const pieces: TemporalMapPiece[] = [];
  let targetAt = rational(0n);

  for (let index = 0; index < input.knots.length - 1; index += 1) {
    const left = input.knots[index]!;
    const right = input.knots[index + 1]!;
    const sourceAtStart = exactTemporalRational(left.sourceAt);
    const sourceAtEnd = exactTemporalRational(right.sourceAt);
    const displacement = subtract(sourceAtEnd, sourceAtStart);
    assert(displacement.numerator !== 0n,
      `Temporal rate profile segment ${index} has no source displacement; a finite hold needs an explicit duration.`);

    const rateAtStart = rate(left.rate, `Temporal rate profile knot ${index}.rate`);
    const rateAtEnd = rate(right.rate, `Temporal rate profile knot ${index + 1}.rate`);
    const rateSum = add(rateAtStart, rateAtEnd);
    assert(rateSum.numerator !== 0n,
      `Temporal rate profile segment ${index} has zero average rate.`);
    const direction = displacement.numerator < 0n ? -1 : 1;
    const followsDirection = (value: bigint) => direction > 0 ? value >= 0n : value <= 0n;
    assert(followsDirection(rateAtStart.numerator) && followsDirection(rateAtEnd.numerator),
    `Temporal rate profile segment ${index} rates must follow its source direction.`);

    const targetDuration = divide(multiply(rational(2n), displacement), rateSum);
    assert(targetDuration.numerator > 0n,
      `Temporal rate profile segment ${index} must have a positive target duration.`);
    const targetEnd = add(targetAt, targetDuration);
    const sourceControl1 = add(sourceAtStart, divide(multiply(targetDuration, rateAtStart), three));
    const sourceControl2 = subtract(sourceAtEnd, divide(multiply(targetDuration, rateAtEnd), three));
    pieces.push({
      target: { start: exactTemporalValue(targetAt), end: exactTemporalValue(targetEnd) },
      sourceAtStart: exactTemporalValue(sourceAtStart),
      sourceControl1: exactTemporalValue(sourceControl1),
      sourceControl2: exactTemporalValue(sourceControl2),
      sourceAtEnd: exactTemporalValue(sourceAtEnd),
    });
    targetAt = targetEnd;
  }

  assert(compare(targetAt, rational(0n)) > 0, "Temporal rate profile target duration must be positive.");
  const target = sealLocalTemporalDomain({ id: input.targetId, duration: exactTemporalValue(targetAt) });
  return sealTemporalMap({
    stages: [{ target, source: structuredClone(input.source), pieces }],
  });
}
