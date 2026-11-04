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

export function subtract(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiply(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

export function divide(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) throw new Error("Cannot divide a temporal rational by zero.");
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
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

/** Nearest frame boundary; an exact half lands on the later boundary. Input must be non-negative. */
export function quantizeBoundary(value: Rational): number {
  if (value.numerator < 0n) throw new Error("Cannot quantize a negative clipped frame boundary.");
  const rounded = (value.numerator * 2n + value.denominator) / (value.denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Temporal boundary exceeds safe frame arithmetic.");
  return Number(rounded);
}

export function floorBoundary(value: Rational): number {
  if (value.numerator < 0n) throw new Error("Cannot resolve a negative temporal boundary.");
  const result = value.numerator / value.denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Temporal boundary exceeds safe frame arithmetic.");
  return Number(result);
}

export function ceilBoundary(value: Rational): number {
  if (value.numerator < 0n) throw new Error("Cannot resolve a negative temporal boundary.");
  const result = (value.numerator + value.denominator - 1n) / value.denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Temporal boundary exceeds safe frame arithmetic.");
  return Number(result);
}
