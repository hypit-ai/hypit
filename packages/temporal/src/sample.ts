import type { ProgramSpace } from "@narratage/program-space";

import type { TemporalDuration } from "./types.js";

function integer(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return BigInt(value);
}

function roundedRatio(numerator: bigint, denominator: bigint, label: string): number {
  if (denominator <= 0n) throw new Error(`${label} denominator must be positive.`);
  const value = (numerator * 2n + denominator) / (denominator * 2n);
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds safe sample arithmetic.`);
  }
  return Number(value);
}

/** Quantize one non-negative authored duration into the canonical sample domain exactly once. */
export function temporalDurationInSamples(
  duration: TemporalDuration,
  space: ProgramSpace,
  sampleRate = 48_000,
): number {
  const rate = integer(sampleRate, "Sample rate");
  if (rate === 0n) throw new Error("Sample rate must be positive.");
  switch (duration.unit) {
    case "frames":
      return roundedRatio(
        integer(duration.value, "Frame duration") * rate * integer(space.frameRate.denominator, "Frame-rate denominator"),
        integer(space.frameRate.numerator, "Frame-rate numerator"),
        "Frame duration",
      );
    case "milliseconds":
      return roundedRatio(integer(duration.value, "Millisecond duration") * rate, 1_000n, "Millisecond duration");
    case "seconds":
      return roundedRatio(
        integer(duration.numerator, "Second duration numerator") * rate,
        integer(duration.denominator, "Second duration denominator"),
        "Second duration",
      );
  }
}
