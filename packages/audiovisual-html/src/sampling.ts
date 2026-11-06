import {
  evaluateAudiovisualProgramAt,
  type AudiovisualEvaluation,
  type AudiovisualProgram,
} from "@hypit/audiovisual";
import {
  assertTemporalSamplingGrid,
  exactTemporalValueFromFrames,
  type ExactTemporalValue,
  type TemporalSamplingGrid,
} from "@hypit/temporal";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type AudiovisualHtmlFrameEvaluation = {
  readonly frame: number;
  readonly frameCount: number;
  readonly sampling: TemporalSamplingGrid;
  readonly evaluation: AudiovisualEvaluation;
};

export function outputFramePosition(frame: number, sampling: TemporalSamplingGrid): ExactTemporalValue {
  assertTemporalSamplingGrid(sampling);
  assert(Number.isSafeInteger(frame) && frame >= 0,
    "Output frame index must be a non-negative safe integer.");
  return exactTemporalValueFromFrames(frame, sampling);
}

export function outputFrameCount(duration: ExactTemporalValue, sampling: TemporalSamplingGrid): number {
  assertTemporalSamplingGrid(sampling);
  const ticks = BigInt(duration.ticks);
  const numerator = ticks * BigInt(duration.timeBase.numerator) * BigInt(sampling.frameRate.numerator);
  const denominator = BigInt(duration.timeBase.denominator) * BigInt(sampling.frameRate.denominator);
  assert(numerator > 0n, "Output duration must be positive.");
  const count = (numerator + denominator - 1n) / denominator;
  assert(count <= BigInt(Number.MAX_SAFE_INTEGER), "Output frame count exceeds the safe integer range.");
  return Number(count);
}

export function evaluateAudiovisualProgramFrame(
  program: AudiovisualProgram,
  sampling: TemporalSamplingGrid,
  frame: number,
): AudiovisualHtmlFrameEvaluation {
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
