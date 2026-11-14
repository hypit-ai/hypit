import {
  assertAudiovisualProgram,
  evaluateAudiovisualProgramAt,
  type AudiovisualEvaluation,
  type AudiovisualProgram,
} from "@hypit/audiovisual";
import {
  assertSpatialMap,
  sameSpatialDomain,
  type SpatialMap,
} from "@hypit/spatial/algebra";
import {
  addExactTemporalValues,
  assertTemporalSamplingGrid,
  exactTemporalValueFromFrames,
  exactTemporalZero,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type TemporalRange,
  type TemporalSamplingGrid,
} from "@hypit/temporal";

import type { AudiovisualPictureDemand } from "./types.js";

/** Invocation-local Picture sampling and viewport closure, independent of any renderer. */
export type AudiovisualPictureOutput = {
  readonly id: string;
  readonly sampling: TemporalSamplingGrid;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly clearColor: string;
  };
  /** Exact output-viewport to Programme-picture sampling relation. */
  readonly pictureMapping: SpatialMap;
};

export type AudiovisualOutputFrameEvaluation = {
  readonly frame: number;
  readonly frameCount: number;
  readonly sampling: TemporalSamplingGrid;
  readonly evaluation: AudiovisualEvaluation;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertAudiovisualPictureOutput(value: AudiovisualPictureOutput): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value.id),
    "Audiovisual Picture output identity is invalid.");
  assertTemporalSamplingGrid(value.sampling);
  assert(Number.isSafeInteger(value.canvas.width) && value.canvas.width > 0
    && Number.isSafeInteger(value.canvas.height) && value.canvas.height > 0,
  "Audiovisual Picture output Canvas must have positive integer dimensions.");
  assert(value.canvas.clearColor.length > 0, "Audiovisual Picture output Canvas clear color is empty.");
  assertSpatialMap(value.pictureMapping);
  assert(value.pictureMapping.target.region.x === 0 && value.pictureMapping.target.region.y === 0
    && value.pictureMapping.target.region.width === value.canvas.width
    && value.pictureMapping.target.region.height === value.canvas.height,
  "Audiovisual Picture output Mapping target must be the selected Canvas viewport.");
}

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

/** Close a Picture output policy into exact AVIR observations without selecting a Terminal. */
export function createAudiovisualPictureDemand(
  program: AudiovisualProgram,
  output: AudiovisualPictureOutput,
  range: TemporalRange = { start: exactTemporalZero(), end: structuredClone(program.domain.duration) },
): AudiovisualPictureDemand {
  assertAudiovisualProgram(program);
  assertAudiovisualPictureOutput(output);
  assert(program.picture !== undefined && program.pictureDomain !== undefined,
    `Audiovisual Programme ${program.id} has no Picture output.`);
  assert(sameSpatialDomain(output.pictureMapping.source, program.pictureDomain),
    `Audiovisual Picture output does not read Programme Space ${program.pictureDomain.id}.`);
  const duration = subtractExactTemporalValues(range.end, range.start);
  const frameCount = outputFrameCount(duration, output.sampling);
  return {
    range: structuredClone(range),
    samples: Array.from({ length: frameCount }, (_, frame) => ({
      position: addExactTemporalValues(range.start, outputFramePosition(frame, output.sampling)),
      side: "after" as const,
    })),
  };
}

/** Factual point projection on one selected output grid; this does not select or execute a renderer. */
export function evaluateAudiovisualProgramFrame(
  program: AudiovisualProgram,
  sampling: TemporalSamplingGrid,
  frame: number,
): AudiovisualOutputFrameEvaluation {
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
