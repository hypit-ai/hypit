import type { ProgramSpace } from "@hypit/program-space";

import type { TemporalDuration } from "./types.js";

export type Rational = {
  readonly numerator: bigint;
  readonly denominator: bigint;
};

function divisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) throw new Error("Temporal rational denominator must not be zero.");
  const sign = denominator < 0n ? -1n : 1n;
  const normalizedNumerator = numerator * sign;
  const normalizedDenominator = denominator * sign;
  const gcd = divisor(normalizedNumerator, normalizedDenominator);
  return {
    numerator: normalizedNumerator / gcd,
    denominator: normalizedDenominator / gcd,
  };
}

export function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function compare(left: Rational, right: Rational): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function maximum(left: Rational, right: Rational): Rational {
  return compare(left, right) >= 0 ? left : right;
}

export function minimum(left: Rational, right: Rational): Rational {
  return compare(left, right) <= 0 ? left : right;
}

function safeInteger(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
  return BigInt(value);
}

export function durationInFrames(duration: TemporalDuration, space: ProgramSpace): Rational {
  const frameNumerator = safeInteger(space.frameRate.numerator, "ProgramSpace frame-rate numerator");
  const frameDenominator = safeInteger(space.frameRate.denominator, "ProgramSpace frame-rate denominator");
  switch (duration.unit) {
    case "frames":
      return rational(safeInteger(duration.value, "Frame duration"));
    case "milliseconds":
      return rational(
        safeInteger(duration.value, "Millisecond duration") * frameNumerator,
        1000n * frameDenominator,
      );
    case "seconds": {
      const numerator = safeInteger(duration.numerator, "Second duration numerator");
      const denominator = safeInteger(duration.denominator, "Second duration denominator");
      if (denominator <= 0n) throw new Error("Second duration denominator must be positive.");
      return rational(numerator * frameNumerator, denominator * frameDenominator);
    }
  }
}

/** Nearest frame boundary; an exact half lands on the later boundary. Input must be non-negative. */
export function quantizeBoundary(value: Rational): number {
  if (value.numerator < 0n) throw new Error("Cannot quantize a negative clipped frame boundary.");
  const rounded = (value.numerator * 2n + value.denominator) / (value.denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Temporal boundary exceeds safe frame arithmetic.");
  return Number(rounded);
}
