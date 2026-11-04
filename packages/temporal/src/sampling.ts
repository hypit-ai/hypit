import { exactTemporalRational, exactTemporalValue } from "./exact.js";
import { ceilBoundary, floorBoundary, multiply, quantizeBoundary, rational } from "./rational.js";
import type { Rational } from "./rational.js";
import type { ExactTemporalValue, TemporalRate } from "./algebra-types.js";

/** Author duration spelling resolved only when a consumer selects a sampling grid. */
export type TemporalDuration =
  | { readonly unit: "frames"; readonly value: number }
  | { readonly unit: "milliseconds"; readonly value: number }
  | { readonly unit: "seconds"; readonly numerator: number; readonly denominator: number };

export type TemporalBoundaryPolicy = "exact" | "cover" | "inside" | "nearest";

/** One consumer-selected discrete grid. It has no Timeline identity or extent. */
export type TemporalSamplingGrid = {
  readonly frameRate: TemporalRate;
};

/** One finite half-open interval on a consumer-selected frame grid. */
export type FrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeInteger(value: number, label: string): bigint {
  assert(Number.isSafeInteger(value), `${label} must be a safe integer.`);
  return BigInt(value);
}

export function assertTemporalSamplingGrid(value: TemporalSamplingGrid): void {
  assert(Number.isSafeInteger(value.frameRate.numerator) && value.frameRate.numerator > 0,
    "Temporal sampling-grid numerator must be a positive safe integer.");
  assert(Number.isSafeInteger(value.frameRate.denominator) && value.frameRate.denominator > 0,
    "Temporal sampling-grid denominator must be a positive safe integer.");
}

export function assertFrameSpan(value: unknown, frameCount?: number): asserts value is FrameSpan {
  const span = value as FrameSpan | undefined;
  if (span === null || typeof span !== "object"
    || !Number.isSafeInteger(span.startFrame) || span.startFrame < 0
    || !Number.isSafeInteger(span.endFrameExclusive) || span.endFrameExclusive <= span.startFrame
    || (frameCount !== undefined && span.endFrameExclusive > frameCount)) {
    throw new Error("Frame span must satisfy 0 <= startFrame < endFrameExclusive <= frameCount");
  }
}

/** Quantize one frame boundary onto an absolute audio sample grid. */
export function frameSampleBoundary(
  grid: TemporalSamplingGrid,
  frame: number,
  sampleRate: number,
): number {
  assertTemporalSamplingGrid(grid);
  assert(Number.isSafeInteger(frame) && frame >= 0, "Frame boundary must be a non-negative safe integer.");
  assert(Number.isSafeInteger(sampleRate) && sampleRate > 0, "Sample rate must be a positive safe integer.");
  const numerator = BigInt(frame) * BigInt(sampleRate) * BigInt(grid.frameRate.denominator);
  const denominator = BigInt(grid.frameRate.numerator);
  const value = (numerator * 2n + denominator) / (denominator * 2n);
  assert(value <= BigInt(Number.MAX_SAFE_INTEGER), "Sample domain exceeds safe arithmetic.");
  return Number(value);
}

export function frameSpanSamples(
  span: FrameSpan,
  grid: TemporalSamplingGrid,
  sampleRate: number,
): { readonly startSample: number; readonly endSampleExclusive: number; readonly sampleFrames: number } {
  assertFrameSpan(span);
  const startSample = frameSampleBoundary(grid, span.startFrame, sampleRate);
  const endSampleExclusive = frameSampleBoundary(grid, span.endFrameExclusive, sampleRate);
  return { startSample, endSampleExclusive, sampleFrames: endSampleExclusive - startSample };
}

export function exactTemporalValueFromFrames(frameCount: number, grid: TemporalSamplingGrid): ExactTemporalValue {
  assertTemporalSamplingGrid(grid);
  assert(Number.isSafeInteger(frameCount), "Frame count must be a safe integer.");
  return exactTemporalValue(rational(
    BigInt(frameCount) * BigInt(grid.frameRate.denominator),
    BigInt(grid.frameRate.numerator),
  ));
}

export function exactTemporalValueFromDuration(
  duration: TemporalDuration,
  grid: TemporalSamplingGrid,
): ExactTemporalValue {
  assertTemporalSamplingGrid(grid);
  switch (duration.unit) {
    case "frames":
      return exactTemporalValueFromFrames(duration.value, grid);
    case "milliseconds":
      return exactTemporalValue(rational(safeInteger(duration.value, "Millisecond duration"), 1_000n));
    case "seconds":
      assert(duration.denominator > 0, "Second duration denominator must be positive.");
      return exactTemporalValue(rational(
        safeInteger(duration.numerator, "Second duration numerator"),
        safeInteger(duration.denominator, "Second duration denominator"),
      ));
  }
}

export function temporalValueInFrames(value: ExactTemporalValue, grid: TemporalSamplingGrid): Rational {
  assertTemporalSamplingGrid(grid);
  return multiply(exactTemporalRational(value), rational(
    BigInt(grid.frameRate.numerator),
    BigInt(grid.frameRate.denominator),
  ));
}

export function resolveTemporalBoundary(
  value: ExactTemporalValue,
  grid: TemporalSamplingGrid,
  policy: TemporalBoundaryPolicy,
): number {
  const frames = temporalValueInFrames(value, grid);
  assert(frames.numerator >= 0n, "Temporal boundary must be non-negative.");
  switch (policy) {
    case "exact":
      assert(frames.denominator === 1n,
        "Temporal boundary does not fall exactly on the selected sampling grid.");
      return floorBoundary(frames);
    case "cover": return ceilBoundary(frames);
    case "inside": return floorBoundary(frames);
    case "nearest": return quantizeBoundary(frames);
  }
}

export function durationInFrames(duration: TemporalDuration, grid: TemporalSamplingGrid): Rational {
  assertTemporalSamplingGrid(grid);
  const frameNumerator = safeInteger(grid.frameRate.numerator, "Sampling-grid numerator");
  const frameDenominator = safeInteger(grid.frameRate.denominator, "Sampling-grid denominator");
  switch (duration.unit) {
    case "frames": return rational(safeInteger(duration.value, "Frame duration"));
    case "milliseconds":
      return rational(safeInteger(duration.value, "Millisecond duration") * frameNumerator,
        1000n * frameDenominator);
    case "seconds": {
      const numerator = safeInteger(duration.numerator, "Second duration numerator");
      const denominator = safeInteger(duration.denominator, "Second duration denominator");
      assert(denominator > 0n, "Second duration denominator must be positive.");
      return rational(numerator * frameNumerator, denominator * frameDenominator);
    }
  }
}
