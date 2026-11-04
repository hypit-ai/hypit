import {
  add,
  compare,
  multiply,
  rational,
  subtract,
} from "./rational.js";
import type { Rational } from "./rational.js";
import type {
  ExactTemporalValue,
  TemporalRate,
} from "./algebra-types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertExactTemporalValue(value: ExactTemporalValue, label = "ExactTemporalValue"): void {
  assert(typeof value === "object" && value !== null, `${label} must be an object.`);
  assert(/^-?(?:0|[1-9][0-9]*)$/u.test(value.ticks), `${label}.ticks must be a decimal integer string.`);
  assert(Number.isSafeInteger(value.timeBase.numerator) && value.timeBase.numerator > 0,
    `${label}.timeBase.numerator must be a positive safe integer.`);
  assert(Number.isSafeInteger(value.timeBase.denominator) && value.timeBase.denominator > 0,
    `${label}.timeBase.denominator must be a positive safe integer.`);
}

export function exactTemporalRational(value: ExactTemporalValue): Rational {
  assertExactTemporalValue(value);
  return rational(
    BigInt(value.ticks) * BigInt(value.timeBase.numerator),
    BigInt(value.timeBase.denominator),
  );
}

/** Canonical exact seconds. The denominator must remain JSON-safe after reduction. */
export function exactTemporalValue(value: Rational): ExactTemporalValue {
  const reduced = rational(value.numerator, value.denominator);
  assert(reduced.denominator <= BigInt(Number.MAX_SAFE_INTEGER),
    "Exact temporal value denominator exceeds the wire representation.");
  return {
    ticks: reduced.numerator.toString(),
    timeBase: { numerator: 1, denominator: Number(reduced.denominator) },
  };
}

export function exactTemporalZero(): ExactTemporalValue {
  return { ticks: "0", timeBase: { numerator: 1, denominator: 1 } };
}

export function compareExactTemporalValues(left: ExactTemporalValue, right: ExactTemporalValue): number {
  return compare(exactTemporalRational(left), exactTemporalRational(right));
}

export function addExactTemporalValues(left: ExactTemporalValue, right: ExactTemporalValue): ExactTemporalValue {
  return exactTemporalValue(add(exactTemporalRational(left), exactTemporalRational(right)));
}

export function subtractExactTemporalValues(left: ExactTemporalValue, right: ExactTemporalValue): ExactTemporalValue {
  return exactTemporalValue(subtract(exactTemporalRational(left), exactTemporalRational(right)));
}

/** Euclidean remainder on exact time. The result is always in [0, modulus). */
export function moduloExactTemporalValue(value: ExactTemporalValue, modulus: ExactTemporalValue): ExactTemporalValue {
  const dividend = exactTemporalRational(value);
  const divisor = exactTemporalRational(modulus);
  assert(divisor.numerator > 0n, "Exact temporal modulus must be positive.");
  const quotientNumerator = dividend.numerator * divisor.denominator;
  const quotientDenominator = dividend.denominator * divisor.numerator;
  let quotient = quotientNumerator / quotientDenominator;
  if (quotientNumerator % quotientDenominator < 0n) quotient -= 1n;
  return exactTemporalValue(subtract(dividend, multiply(divisor, rational(quotient))));
}

export function scaleExactTemporalValue(value: ExactTemporalValue, rate: TemporalRate): ExactTemporalValue {
  assert(Number.isSafeInteger(rate.numerator), "Temporal rate numerator must be a safe integer.");
  assert(Number.isSafeInteger(rate.denominator) && rate.denominator > 0,
    "Temporal rate denominator must be a positive safe integer.");
  return exactTemporalValue(multiply(exactTemporalRational(value), rational(
    BigInt(rate.numerator), BigInt(rate.denominator),
  )));
}
