import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalZero,
  scaleExactTemporalValue,
  subtractExactTemporalValues,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

export type NleSnapGuide = {
  readonly at: ExactTemporalValue;
  readonly kind: string;
  readonly label?: string;
};

export type NleSnapResult = {
  readonly at: ExactTemporalValue;
  readonly guide?: NleSnapGuide;
};

function absolute(value: ExactTemporalValue): ExactTemporalValue {
  return compareExactTemporalValues(value, exactTemporalZero()) < 0
    ? scaleExactTemporalValue(value, { numerator: -1, denominator: 1 })
    : value;
}

function seconds(value: ExactTemporalValue): number {
  const rational = exactTemporalRational(value);
  const numerator = rational.numerator < 0n ? -rational.numerator : rational.numerator;
  if (numerator === 0n) return 0;
  const numeratorText = numerator.toString();
  const denominatorText = rational.denominator.toString();
  const numeratorDigits = numeratorText.slice(0, 16);
  const denominatorDigits = denominatorText.slice(0, 16);
  const numeratorMantissa = Number(numeratorDigits) / (10 ** (numeratorDigits.length - 1));
  const denominatorMantissa = Number(denominatorDigits) / (10 ** (denominatorDigits.length - 1));
  return (numeratorMantissa / denominatorMantissa)
    * (10 ** (numeratorText.length - denominatorText.length));
}

/** Resolve one transient UI snap gesture without persisting a guide or quantizing project time. */
export function snapNleTime(
  value: ExactTemporalValue,
  guides: readonly NleSnapGuide[],
  pixelsPerSecond: number,
  tolerancePixels = 8,
): NleSnapResult {
  assertExactTemporalValue(value, "NLE snap value");
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
    throw new Error("NLE snap pixelsPerSecond must be positive and finite.");
  }
  if (!Number.isFinite(tolerancePixels) || tolerancePixels < 0) {
    throw new Error("NLE snap tolerancePixels must be non-negative and finite.");
  }

  let nearest: { readonly guide: NleSnapGuide; readonly distance: ExactTemporalValue } | undefined;
  for (const guide of guides) {
    assertExactTemporalValue(guide.at, `NLE ${guide.kind} snap guide`);
    const distance = absolute(subtractExactTemporalValues(guide.at, value));
    if (nearest === undefined || compareExactTemporalValues(distance, nearest.distance) < 0) {
      nearest = { guide, distance };
    }
  }
  if (nearest === undefined || seconds(nearest.distance) * pixelsPerSecond > tolerancePixels) {
    return { at: structuredClone(value) };
  }
  return {
    at: structuredClone(nearest.guide.at),
    guide: structuredClone(nearest.guide),
  };
}
