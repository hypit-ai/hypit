import type { MediaRational } from "./types.js";

/** A half-open selection on the original programme frame clock. */
export type MediaFrameRange = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export function verifyMediaFrameRange(value: unknown, frameCount?: number): asserts value is MediaFrameRange {
  const range = value as MediaFrameRange | undefined;
  if (range === null || typeof range !== "object"
    || !Number.isSafeInteger(range.startFrame) || range.startFrame < 0
    || !Number.isSafeInteger(range.endFrameExclusive) || range.endFrameExclusive <= range.startFrame
    || (frameCount !== undefined && range.endFrameExclusive > frameCount)) {
    throw new Error("Media frame range must satisfy 0 <= startFrame < endFrameExclusive <= frameCount");
  }
}

/**
 * Start on the original clock; duration belongs to the new zero-based frame clock.
 * At rational rates, rounding the two clocks can differ by one PCM sample.
 */
export function mediaFrameRangeSamples(range: MediaFrameRange, frameRate: MediaRational) {
  verifyMediaFrameRange(range);
  const boundary = (frame: number): number => {
    const n = BigInt(frame) * 48_000n * BigInt(frameRate.denominator);
    const d = BigInt(frameRate.numerator);
    return Number((2n * n + d) / (2n * d));
  };
  const startSample = boundary(range.startFrame);
  const sampleFrames = boundary(range.endFrameExclusive - range.startFrame);
  return { startSample, endSampleExclusive: startSample + sampleFrames, sampleFrames };
}
