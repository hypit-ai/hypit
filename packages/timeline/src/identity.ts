import type { Clock, FrameSpan, Timeline } from "./types.js";

export function sealClock(value: Clock): Clock {
  assertClockIdentity(value);
  return structuredClone(value);
}

export function assertClockIdentity(clock: Clock): void {
  const { numerator, denominator } = clock.frameRate;
  if (!Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("Clock is invalid.");
  }
}

export function sealTimeline(value: Timeline): Timeline {
  assertTimelineIdentity(value);
  return structuredClone(value);
}

export function assertTimelineIdentity(timeline: Timeline): void {
  assertClockIdentity(timeline);
  if (!timeline.id.trim() || !Number.isSafeInteger(timeline.frameCount) || timeline.frameCount < 1) {
    throw new Error("Timeline is invalid.");
  }
}

export function timelineFrameCount(timeline: Timeline): number {
  assertTimelineIdentity(timeline);
  return timeline.frameCount;
}

export function timelineDurationSeconds(timeline: Timeline): number {
  assertTimelineIdentity(timeline);
  return timeline.frameCount * timeline.frameRate.denominator / timeline.frameRate.numerator;
}

export function timelineSampleFrames(timeline: Timeline, sampleRate: number): number {
  return timelineFrameSampleBoundary(timeline, timelineFrameCount(timeline), sampleRate);
}

export function timelineFrameSampleBoundary(timeline: Timeline, frame: number, sampleRate: number): number {
  const frames = timelineFrameCount(timeline);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > frames) {
    throw new Error("Timeline frame boundary is invalid.");
  }
  return clockFrameSampleBoundary(timeline, frame, sampleRate);
}

export function clockFrameSampleBoundary(clock: Clock, frame: number, sampleRate: number): number {
  assertClockIdentity(clock);
  if (!Number.isSafeInteger(frame) || frame < 0) throw new Error("Clock frame boundary is invalid.");
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new Error("Timeline sample rate is invalid.");
  const numerator = BigInt(frame) * BigInt(sampleRate) * BigInt(clock.frameRate.denominator);
  const denominator = BigInt(clock.frameRate.numerator);
  const value = (numerator * 2n + denominator) / (denominator * 2n);
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Timeline sample domain exceeds safe arithmetic.");
  return Number(value);
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

/** Quantize a selected span as a new zero-based sample interval on the same Clock. */
export function clockFrameSpanSamples(span: FrameSpan, clock: Clock, sampleRate: number) {
  assertFrameSpan(span);
  const startSample = clockFrameSampleBoundary(clock, span.startFrame, sampleRate);
  const sampleFrames = clockFrameSampleBoundary(clock,
    span.endFrameExclusive - span.startFrame, sampleRate);
  return { startSample, endSampleExclusive: startSample + sampleFrames, sampleFrames };
}
