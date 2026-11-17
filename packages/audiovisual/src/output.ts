import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  temporalRangeRegionSet,
  type ExactTemporalValue,
  type TemporalMapPoint,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { assertAudiovisualProgram } from "./program.js";
import type { AudiovisualProgram } from "./types.js";

export type AudiovisualFrameRate = {
  readonly numerator: number;
  readonly denominator: number;
};

export type AudiovisualPictureDemand = {
  readonly range: TemporalRange;
  readonly samples: readonly TemporalMapPoint[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertAudiovisualFrameRate(value: AudiovisualFrameRate): void {
  assert(Number.isSafeInteger(value.numerator) && value.numerator > 0
    && Number.isSafeInteger(value.denominator) && value.denominator > 0,
  "Audiovisual Picture frame rate is invalid.");
}

/** Exact Programme-local position of one zero-origin output frame. */
export function audiovisualFramePosition(frame: number, rate: AudiovisualFrameRate): ExactTemporalValue {
  assertAudiovisualFrameRate(rate);
  assert(Number.isSafeInteger(frame) && frame >= 0, "Audiovisual Picture frame is invalid.");
  return {
    ticks: String(BigInt(frame) * BigInt(rate.denominator)),
    timeBase: { numerator: 1, denominator: rate.numerator },
  };
}

/** Cover one positive exact duration with the selected rational output grid. */
export function audiovisualFrameCount(duration: ExactTemporalValue, rate: AudiovisualFrameRate): number {
  assertAudiovisualFrameRate(rate);
  const ticks = BigInt(duration.ticks);
  const numerator = ticks * BigInt(duration.timeBase.numerator) * BigInt(rate.numerator);
  const denominator = BigInt(duration.timeBase.denominator) * BigInt(rate.denominator);
  assert(numerator > 0n, "Audiovisual Picture output duration must be positive.");
  const count = (numerator + denominator - 1n) / denominator;
  assert(count <= BigInt(Number.MAX_SAFE_INTEGER), "Audiovisual Picture frame count exceeds safe integer range.");
  return Number(count);
}

/** Close an invocation-selected Picture range and grid into exact AVIR observations. */
export function createAudiovisualPictureDemand(
  program: AudiovisualProgram,
  rate: AudiovisualFrameRate,
  range: TemporalRange = { start: exactTemporalZero(), end: structuredClone(program.domain.duration) },
): AudiovisualPictureDemand {
  assertAudiovisualProgram(program);
  assertAudiovisualFrameRate(rate);
  assert(program.picture !== undefined && program.pictureDomain !== undefined,
    `Audiovisual Programme ${program.id} has no Picture output.`);
  temporalRangeRegionSet(program.domain, range);
  assert(compareExactTemporalValues(range.start, range.end) < 0,
    "Audiovisual Picture output range must be positive.");
  const frameCount = audiovisualFrameCount(subtractExactTemporalValues(range.end, range.start), rate);
  return {
    range: structuredClone(range),
    samples: Array.from({ length: frameCount }, (_, frame) => ({
      position: addExactTemporalValues(range.start, audiovisualFramePosition(frame, rate)),
      side: "after" as const,
    })),
  };
}
