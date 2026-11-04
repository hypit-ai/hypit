import { assertExactTemporalValue, exactTemporalValue } from "@hypit/temporal/algebra";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

import { evaluateAudiovisualProgramAt } from "./evaluation.js";
import type {
  AudiovisualFrameEvaluation,
  AudiovisualProgram,
  VideoFrameSampling,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertVideoFrameSampling(value: VideoFrameSampling): void {
  assert(Number.isSafeInteger(value.frameRate.numerator) && value.frameRate.numerator > 0,
    "Video frame-rate numerator must be a positive safe integer.");
  assert(Number.isSafeInteger(value.frameRate.denominator) && value.frameRate.denominator > 0,
    "Video frame-rate denominator must be a positive safe integer.");
}

/** Exact start position of one terminal output frame. */
export function outputFramePosition(frame: number, value: VideoFrameSampling): ExactTemporalValue {
  assertVideoFrameSampling(value);
  assert(Number.isSafeInteger(frame) && frame >= 0, "Output frame index must be a non-negative safe integer.");
  return exactTemporalValue({
    numerator: BigInt(frame) * BigInt(value.frameRate.denominator),
    denominator: BigInt(value.frameRate.numerator),
  });
}

/** Number of frame starts needed to cover a positive exact duration. */
export function outputFrameCount(duration: ExactTemporalValue, value: VideoFrameSampling): number {
  assertExactTemporalValue(duration, "Output duration");
  assertVideoFrameSampling(value);
  const numerator = BigInt(duration.ticks)
    * BigInt(duration.timeBase.numerator)
    * BigInt(value.frameRate.numerator);
  const denominator = BigInt(duration.timeBase.denominator)
    * BigInt(value.frameRate.denominator);
  assert(numerator > 0n, "Output duration must be positive.");
  const count = (numerator + denominator - 1n) / denominator;
  assert(count <= BigInt(Number.MAX_SAFE_INTEGER), "Output frame count exceeds the safe integer range.");
  return Number(count);
}

/** Apply terminal frame sampling without introducing a Timeline into the authored Programme. */
export function evaluateAudiovisualProgramFrame(
  program: AudiovisualProgram,
  sampling: VideoFrameSampling,
  frame: number,
): AudiovisualFrameEvaluation {
  const frameCount = outputFrameCount(program.domain.duration, sampling);
  assert(Number.isSafeInteger(frame) && frame >= 0 && frame < frameCount,
    `Output frame ${frame} lies outside [0, ${frameCount}).`);
  return {
    frame,
    frameCount,
    sampling: structuredClone(sampling),
    evaluation: evaluateAudiovisualProgramAt(program, outputFramePosition(frame, sampling)),
  };
}
