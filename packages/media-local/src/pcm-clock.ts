import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export function pcmSampleIndex(value: ExactTemporalValue, rate: number): number {
  const numerator = BigInt(value.ticks) * BigInt(value.timeBase.numerator) * BigInt(rate);
  const denominator = BigInt(value.timeBase.denominator);
  const sample = Number((2n * numerator + denominator) / (2n * denominator));
  if (!Number.isSafeInteger(sample) || numerator < 0n) {
    throw new Error("Media PCM sample address is outside the local range.");
  }
  return sample;
}
