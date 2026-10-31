import type { TemporalDuration } from "./types.js";

function divisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

/** Parse one exact non-negative authored duration without depending on a Frontend syntax tree. */
export function parseTemporalDuration(value: string, label: string): TemporalDuration {
  const rationalSeconds = /^(\d+)\/([1-9]\d*)s$/u.exec(value.trim());
  if (rationalSeconds !== null) {
    const numerator = Number(rationalSeconds[1]), denominator = Number(rationalSeconds[2]);
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) throw new Error(`${label} is outside safe arithmetic.`);
    const common = divisor(numerator, denominator);
    return { unit: "seconds", numerator: numerator / common, denominator: denominator / common };
  }
  const match = /^(\d+)(?:\.(\d+))?(f|ms|s)$/u.exec(value.trim());
  if (match === null) throw new Error(`${label} must be an exact duration such as 12f, 250ms or 1.5s.`);
  const whole = Number(match[1]);
  const fraction = match[2] ?? "";
  const unit = match[3];
  if (!Number.isSafeInteger(whole)) throw new Error(`${label} is outside safe arithmetic.`);
  if (unit === "f" || unit === "ms") {
    if (fraction.length > 0) throw new Error(`${label} ${unit} duration must be an integer.`);
    return { unit: unit === "f" ? "frames" : "milliseconds", value: whole };
  }
  const scale = 10 ** fraction.length;
  const numerator = whole * scale + (fraction.length === 0 ? 0 : Number(fraction));
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(scale)) {
    throw new Error(`${label} is outside safe arithmetic.`);
  }
  const common = divisor(numerator, scale);
  return { unit: "seconds", numerator: numerator / common, denominator: scale / common };
}
