import { verifyMediaInspection } from "@hypit/media";
import type { MediaAudioStream, MediaInspection, MediaVideoStream } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

import type {
  AudioExtractionRequest,
  FrameExtractionRequest,
  MediaAudioSelector,
  MediaTransformProgram,
  MediaVideoSelector,
  StillVideoLayout,
  StillVideoRequest,
  StillVideoSegment,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finiteNonNegative(value: unknown, subject: string): number {
  assert(typeof value === "number" && Number.isFinite(value) && value >= 0,
    `${subject} must be a finite non-negative number`);
  return value;
}

function streamIndex(value: unknown, subject: string): number {
  assert(Number.isSafeInteger(value) && (value as number) >= 0, `${subject} must be a non-negative integer`);
  return value as number;
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

export function verifyMediaTransformProgram(value: unknown): asserts value is MediaTransformProgram {
  const program = object(value, "MediaTransformProgram");
  assert(Array.isArray(program.operations) && program.operations.length > 0,
    "MediaTransformProgram requires at least one operation");
  for (const [index, raw] of program.operations.entries()) {
    const operation = object(raw, `MediaTransformProgram operation ${index}`);
    if (operation.kind === "trim") {
      const start = operation.startSec;
      const end = operation.endSec;
      const tail = operation.tailSec;
      assert(start !== undefined || end !== undefined || tail !== undefined,
        `MediaTransformProgram trim ${index} must specify startSec, endSec or tailSec`);
      if (start !== undefined) finiteNonNegative(start, `MediaTransformProgram trim ${index}.startSec`);
      if (end !== undefined) finiteNonNegative(end, `MediaTransformProgram trim ${index}.endSec`);
      if (tail !== undefined) finiteNonNegative(tail, `MediaTransformProgram trim ${index}.tailSec`);
      assert(end === undefined || tail === undefined,
        `MediaTransformProgram trim ${index} cannot specify both endSec and tailSec`);
      if (start !== undefined && end !== undefined) {
        assert((end as number) > (start as number),
          `MediaTransformProgram trim ${index}.endSec must be after startSec`);
      }
      continue;
    }
    assert(operation.kind === "retime", `MediaTransformProgram operation ${index} kind is invalid`);
    assert(typeof operation.rate === "number" && Number.isFinite(operation.rate) && operation.rate > 0
      && operation.rate <= 100,
    `MediaTransformProgram retime ${index}.rate must be in (0, 100]`);
    assert(operation.pitch === "preserve", `MediaTransformProgram retime ${index}.pitch must be preserve`);
  }
}

export function sealMediaTransformProgram(value: MediaTransformProgram): MediaTransformProgram {
  const result = canonicalize(value) as unknown as MediaTransformProgram;
  verifyMediaTransformProgram(result);
  return result;
}

function verifyVideoSelector(value: unknown, subject: string): asserts value is MediaVideoSelector {
  const selector = object(value, subject);
  assert(selector.mode === "primary-moving" || selector.mode === "stream-index", `${subject}.mode is invalid`);
  if (selector.mode === "stream-index") streamIndex(selector.streamIndex, `${subject}.streamIndex`);
}

function verifyAudioSelector(value: unknown, subject: string, allowNone: boolean): asserts value is MediaAudioSelector {
  const selector = object(value, subject);
  assert(selector.mode === "default" || selector.mode === "stream-index" || (allowNone && selector.mode === "none"),
    `${subject}.mode is invalid`);
  if (selector.mode === "stream-index") streamIndex(selector.streamIndex, `${subject}.streamIndex`);
}

export function verifyAudioExtractionRequest(value: unknown): asserts value is AudioExtractionRequest {
  const request = object(value, "AudioExtractionRequest");
  verifyAudioSelector(request.audio, "AudioExtractionRequest.audio", false);
  const output = object(request.output, "AudioExtractionRequest.output");
  assert(output.container === "wav" && output.codec === "pcm_s16le"
    && output.sampleRate === 48_000 && output.channels === 2,
  "AudioExtractionRequest output profile is unsupported");
}

export function sealAudioExtractionRequest(value: AudioExtractionRequest): AudioExtractionRequest {
  const result = canonicalize(value) as unknown as AudioExtractionRequest;
  verifyAudioExtractionRequest(result);
  return result;
}

export function verifyFrameExtractionRequest(value: unknown): asserts value is FrameExtractionRequest {
  const request = object(value, "FrameExtractionRequest");
  verifyVideoSelector(request.video, "FrameExtractionRequest.video");
  const at = object(request.at, "FrameExtractionRequest.at");
  assert(at.kind === "first" || at.kind === "last" || at.kind === "frame" || at.kind === "time",
    "FrameExtractionRequest.at.kind is invalid");
  if (at.kind === "frame") streamIndex(at.index, "FrameExtractionRequest.at.index");
  if (at.kind === "time") finiteNonNegative(at.seconds, "FrameExtractionRequest.at.seconds");
  const output = object(request.output, "FrameExtractionRequest.output");
  assert(output.format === "png", "FrameExtractionRequest output format is unsupported");
}

export function sealFrameExtractionRequest(value: FrameExtractionRequest): FrameExtractionRequest {
  const result = canonicalize(value) as unknown as FrameExtractionRequest;
  verifyFrameExtractionRequest(result);
  return result;
}

export function verifyStillVideoLayout(value: unknown): asserts value is StillVideoLayout {
  const layout = object(value, "StillVideoLayout");
  assert(Array.isArray(layout.weights) && layout.weights.length > 0, "StillVideoLayout needs at least one weight");
  for (const weight of layout.weights) {
    assert(typeof weight === "number" && Number.isFinite(weight) && weight > 0, "StillVideoLayout weights must be positive");
  }
  assert(layout.guide === undefined || layout.guide === "clip-time", "StillVideoLayout guide is unsupported");
}

export function sealStillVideoLayout(value: StillVideoLayout): StillVideoLayout {
  const result = canonicalize(value) as unknown as StillVideoLayout;
  verifyStillVideoLayout(result);
  return result;
}

/**
 * Spread `frameCount` whole frames over the weights. Every picture first holds one frame; the rest
 * are shared by weight, each picture taking the floor of its share and the frames left over going
 * one each to the largest fractional remainders, earlier picture first on a tie. Deterministic, and
 * refused when there are fewer frames than pictures.
 */
export function planStillVideoSegments(frameCount: number, weights: readonly number[]): readonly StillVideoSegment[] {
  assert(Number.isSafeInteger(frameCount) && frameCount > 0, "Still video frame count must be positive");
  assert(weights.length > 0, "Still video needs at least one picture");
  assert(frameCount >= weights.length, `Still video has ${frameCount} frames for ${weights.length} pictures; each picture needs at least one`);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shared = frameCount - weights.length;
  const exact = weights.map((weight) => shared * weight / total);
  const floors = exact.map((share) => 1 + Math.floor(share));
  let remaining = frameCount - floors.reduce((sum, item) => sum + item, 0);
  const order = exact.map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const { index } of order) {
    if (remaining === 0) break;
    floors[index] = floors[index]! + 1;
    remaining -= 1;
  }
  const segments: StillVideoSegment[] = [];
  let start = 0;
  for (const frames of floors) {
    segments.push({ startFrame: start, endFrameExclusive: start + frames });
    start += frames;
  }
  return segments;
}

export function verifyStillVideoRequest(value: unknown): asserts value is StillVideoRequest {
  const request = object(value, "StillVideoRequest");
  const frameRate = object(request.frameRate, "StillVideoRequest.frameRate");
  assert(Number.isSafeInteger(frameRate.numerator) && (frameRate.numerator as number) > 0
    && Number.isSafeInteger(frameRate.denominator) && (frameRate.denominator as number) > 0,
  "StillVideoRequest.frameRate must be a positive rational");
  assert(Number.isSafeInteger(request.frameCount) && (request.frameCount as number) > 0,
    "StillVideoRequest.frameCount must be positive");
  assert(request.guide === undefined || request.guide === "clip-time", "StillVideoRequest guide is unsupported");
  const output = object(request.output, "StillVideoRequest.output");
  assert(output.container === "mp4" && output.codec === "h264" && output.pixelFormat === "yuv420p",
    "StillVideoRequest output profile is unsupported");
  assert(Array.isArray(request.segments) && request.segments.length > 0, "StillVideoRequest needs at least one segment");
  let cursor = 0;
  for (const item of request.segments) {
    const segment = object(item, "StillVideoRequest.segments[]");
    assert(segment.startFrame === cursor, "StillVideoRequest segments must be contiguous from frame 0");
    assert(Number.isSafeInteger(segment.endFrameExclusive) && (segment.endFrameExclusive as number) > cursor,
      "StillVideoRequest segments must each hold at least one frame");
    cursor = segment.endFrameExclusive as number;
    if (segment.source !== undefined) {
      const source = object(segment.source, "StillVideoRequest.segments[].source");
      assert(source.kind === "blob" && typeof source.mediaType === "string" && source.mediaType.startsWith("image/"),
        "StillVideoRequest segment source must be an image Artifact");
    }
  }
  assert(cursor === request.frameCount, "StillVideoRequest segments must cover exactly frameCount frames");
}

export function sealStillVideoRequest(value: StillVideoRequest): StillVideoRequest {
  const result = canonicalize(value) as unknown as StillVideoRequest;
  verifyStillVideoRequest(result);
  return result;
}

/** Attach one picture to the first segment that has none; the pictures arrive in authored order. */
export function bindStillVideoSource(request: StillVideoRequest, source: BlobRef): StillVideoRequest {
  verifyStillVideoRequest(request);
  assert(source.kind === "blob" && source.mediaType.startsWith("image/"), "Still video source must be an image Artifact");
  const index = request.segments.findIndex((segment) => segment.source === undefined);
  assert(index >= 0, "Still video already has a picture for every segment");
  return sealStillVideoRequest({
    ...request,
    segments: request.segments.map((segment, at) => at === index ? { ...segment, source } : segment),
  });
}

function uniqueDefault<T extends { readonly disposition: { readonly default: boolean }; readonly index: number }>(
  values: readonly T[],
  subject: string,
): T {
  assert(values.length > 0, `${subject} has no eligible stream`);
  const defaults = values.filter((item) => item.disposition.default);
  if (defaults.length === 1) return defaults[0]!;
  assert(defaults.length === 0, `${subject} has multiple default streams: ${defaults.map((item) => item.index).join(", ")}`);
  assert(values.length === 1, `${subject} is ambiguous: ${values.map((item) => item.index).join(", ")}`);
  return values[0]!;
}

export function selectVideoStream(inspection: MediaInspection, selector: MediaVideoSelector): MediaVideoStream {
  verifyMediaInspection(inspection);
  verifyVideoSelector(selector, "Video selector");
  const moving = inspection.streams.filter((item): item is MediaVideoStream =>
    item.kind === "video" && item.role === "moving" && !item.disposition.attachedPicture
      && item.timingStatus === "admissible" && item.startPts !== undefined && item.endPts !== undefined);
  if (selector.mode === "primary-moving") return uniqueDefault(moving, "Primary moving video");
  const result = moving.find((item) => item.index === selector.streamIndex);
  assert(result !== undefined, `Video stream ${selector.streamIndex} is not an eligible moving stream`);
  return result;
}

export function selectAudioStream(
  inspection: MediaInspection,
  selector: Exclude<MediaAudioSelector, { readonly mode: "none" }>,
): MediaAudioStream {
  verifyMediaInspection(inspection);
  verifyAudioSelector(selector, "Audio selector", false);
  const audio = inspection.streams.filter((item): item is MediaAudioStream =>
    item.kind === "audio" && item.timingStatus === "admissible"
      && item.startPts !== undefined && item.endPts !== undefined);
  if (selector.mode === "default") return uniqueDefault(audio, "Default audio");
  const result = audio.find((item) => item.index === selector.streamIndex);
  assert(result !== undefined, `Audio stream ${selector.streamIndex} is not eligible`);
  return result;
}
