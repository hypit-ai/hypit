import type { ExactTemporalValue, TemporalRate } from "@hypit/temporal/algebra";

export function studioFrameTime(frame: number, rate: TemporalRate): ExactTemporalValue {
  if (!Number.isSafeInteger(frame)) throw new Error("NLE Studio frame must be a safe integer.");
  return { ticks: String(BigInt(frame) * BigInt(rate.denominator)), timeBase: { numerator: 1, denominator: rate.numerator } };
}
