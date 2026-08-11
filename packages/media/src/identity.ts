import {
  canonicalize,
  isDigest,
} from "@narratage/protocol";
import type { BlobRef } from "@narratage/protocol";

import type {
  MediaInspection,
  MuxedMedia,
  MediaRational,
  RenderedVisual,
  MediaStream,
  MediaStreamSelection,
  MediaTimestamp,
  SynchronizedMedia,
  TimelineAudio,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function nonNegativeInteger(value: unknown, subject: string): number {
  assert(Number.isSafeInteger(value) && (value as number) >= 0, `${subject} must be a non-negative integer`);
  return value as number;
}

function positiveInteger(value: unknown, subject: string): number {
  const result = nonNegativeInteger(value, subject);
  assert(result > 0, `${subject} must be positive`);
  return result;
}

function verifyRational(value: unknown, subject: string): asserts value is MediaRational {
  const item = object(value, subject);
  positiveInteger(item.numerator, `${subject}.numerator`);
  positiveInteger(item.denominator, `${subject}.denominator`);
}

function verifyTimestamp(value: unknown, subject: string): asserts value is MediaTimestamp {
  const item = object(value, subject);
  assert(typeof item.ticks === "string" && /^-?\d+$/u.test(item.ticks), `${subject}.ticks is invalid`);
  verifyRational(item.timeBase, `${subject}.timeBase`);
}

function compareTimestamp(left: MediaTimestamp, right: MediaTimestamp): number {
  const leftTicks = BigInt(left.ticks) * BigInt(left.timeBase.numerator);
  const rightTicks = BigInt(right.ticks) * BigInt(right.timeBase.numerator);
  const leftScaled = leftTicks * BigInt(right.timeBase.denominator);
  const rightScaled = rightTicks * BigInt(left.timeBase.denominator);
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function verifyBlob(value: unknown, subject: string): asserts value is BlobRef {
  const item = object(value, subject);
  assert(item.kind === "blob", `${subject} must be a BlobRef`);
  assert(typeof item.digest === "string" && isDigest(item.digest), `${subject}.digest is invalid`);
  nonNegativeInteger(item.size, `${subject}.size`);
  assert(typeof item.mediaType === "string" && item.mediaType.length > 0, `${subject}.mediaType is invalid`);
}

function verifyStream(value: unknown, subject: string): asserts value is MediaStream {
  const item = object(value, subject);
  nonNegativeInteger(item.index, `${subject}.index`);
  assert(typeof item.codecType === "string" && item.codecType.length > 0, `${subject}.codecType is invalid`);
  assert(typeof item.codecName === "string" && item.codecName.length > 0, `${subject}.codecName is invalid`);
  assert(item.timingStatus === "admissible" || item.timingStatus === "missing"
    || item.timingStatus === "non-monotonic" || item.timingStatus === "discontinuous",
  `${subject}.timingStatus is invalid`);
  nonNegativeInteger(item.decodedUnitCount, `${subject}.decodedUnitCount`);
  const disposition = object(item.disposition, `${subject}.disposition`);
  assert(typeof disposition.default === "boolean", `${subject}.disposition.default is invalid`);
  assert(typeof disposition.attachedPicture === "boolean", `${subject}.disposition.attachedPicture is invalid`);
  if (item.timeBase !== undefined) verifyRational(item.timeBase, `${subject}.timeBase`);
  if (item.startPts !== undefined) verifyTimestamp(item.startPts, `${subject}.startPts`);
  if (item.endPts !== undefined) verifyTimestamp(item.endPts, `${subject}.endPts`);
  assert((item.startPts === undefined) === (item.endPts === undefined), `${subject} must provide both presentation endpoints`);
  assert(item.timingStatus !== "admissible" || item.startPts !== undefined,
    `${subject} admissible timing has no presentation interval`);
  if (item.startPts !== undefined && item.endPts !== undefined) {
    assert(compareTimestamp(item.startPts, item.endPts) < 0, `${subject} presentation interval is empty or reversed`);
  }
  if (item.kind === "video") {
    assert(item.codecType === "video", `${subject} video codecType differs`);
    assert(item.role === "moving" || item.role === "attached-picture" || item.role === "still", `${subject}.role is invalid`);
    positiveInteger(item.width, `${subject}.width`);
    positiveInteger(item.height, `${subject}.height`);
    verifyRational(item.sampleAspectRatio, `${subject}.sampleAspectRatio`);
    assert(item.rotationDegrees === 0 || item.rotationDegrees === 90
      || item.rotationDegrees === 180 || item.rotationDegrees === 270,
    `${subject}.rotationDegrees is invalid`);
    if (item.averageFrameRate !== undefined) verifyRational(item.averageFrameRate, `${subject}.averageFrameRate`);
    if (item.nominalFrameRate !== undefined) verifyRational(item.nominalFrameRate, `${subject}.nominalFrameRate`);
    if (item.role === "attached-picture") {
      assert(disposition.attachedPicture === true, `${subject} attached-picture role differs from disposition`);
    }
  } else if (item.kind === "audio") {
    assert(item.codecType === "audio", `${subject} audio codecType differs`);
    positiveInteger(item.sampleRate, `${subject}.sampleRate`);
    positiveInteger(item.channels, `${subject}.channels`);
    nonNegativeInteger(item.decodedSampleFrames, `${subject}.decodedSampleFrames`);
    if (item.channelLayout !== undefined) {
      assert(typeof item.channelLayout === "string" && item.channelLayout.length > 0, `${subject}.channelLayout is invalid`);
    }
  } else {
    assert(item.kind === "other", `${subject}.kind is invalid`);
  }
}

function expectedSampleFrames(frameCount: number, frameRate: MediaRational): number {
  const numerator = BigInt(frameCount) * 48_000n * BigInt(frameRate.denominator);
  const denominator = BigInt(frameRate.numerator);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  assert(rounded > 0n && rounded <= BigInt(Number.MAX_SAFE_INTEGER), "Media frame domain has an invalid sample count");
  return Number(rounded);
}

export function sealMediaInspection(value: MediaInspection): MediaInspection {
  return canonicalize(value) as unknown as MediaInspection;
}

export function verifyMediaInspection(value: unknown): asserts value is MediaInspection {
  const item = object(value, "MediaInspection") as unknown as MediaInspection;
  assert(item.contract === "svml.media-inspection@1", "MediaInspection contract is invalid");
  assert(Array.isArray(item.container?.formatNames), "MediaInspection container formats are invalid");
  item.container.formatNames.forEach((format) => assert(typeof format === "string" && format.length > 0,
    "MediaInspection container format is invalid"));
  assert(Array.isArray(item.streams), "MediaInspection streams are invalid");
  item.streams.forEach((stream, index) => verifyStream(stream, `MediaInspection.streams[${index}]`));
  assert(new Set(item.streams.map((stream) => stream.index)).size === item.streams.length,
    "MediaInspection repeats a stream index");
}

export function sealMediaStreamSelection(value: MediaStreamSelection): MediaStreamSelection {
  return canonicalize(value) as unknown as MediaStreamSelection;
}

export function verifyMediaStreamSelection(value: unknown): asserts value is MediaStreamSelection {
  const item = object(value, "MediaStreamSelection") as unknown as MediaStreamSelection;
  assert(item.contract === "svml.media-stream-selection@1", "MediaStreamSelection contract is invalid");
  if (item.videoStreamIndex !== undefined) nonNegativeInteger(item.videoStreamIndex, "MediaStreamSelection.videoStreamIndex");
  if (item.audioStreamIndex !== undefined) nonNegativeInteger(item.audioStreamIndex, "MediaStreamSelection.audioStreamIndex");
  assert(item.videoStreamIndex !== undefined || item.audioStreamIndex !== undefined,
    "MediaStreamSelection selects no stream");
  assert(item.spanAuthority === "video" || item.spanAuthority === "audio", "MediaStreamSelection authority is invalid");
  assert(item.spanAuthority === "video" ? item.videoStreamIndex !== undefined : item.audioStreamIndex !== undefined,
    "MediaStreamSelection authority stream is absent");
  assert(item.policy === "primary-moving@1" || item.policy === "default-audio@1"
    || item.policy === "primary-moving-default-audio@1" || item.policy === "explicit-streams@1",
    "MediaStreamSelection policy is invalid");
}

export function sealSynchronizedMedia(value: SynchronizedMedia): SynchronizedMedia {
  return canonicalize(value) as unknown as SynchronizedMedia;
}

/** Exact 48 kHz sample span implied by one normalized frame domain. */
export function synchronizedMediaSampleFrames(value: SynchronizedMedia): number {
  const numerator = BigInt(value.timeline.frameCount) * 48_000n * BigInt(value.timeline.frameRate.denominator);
  const denominator = BigInt(value.timeline.frameRate.numerator);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  assert(rounded > 0n && rounded <= BigInt(Number.MAX_SAFE_INTEGER),
    "SynchronizedMedia frame domain has an invalid sample span");
  return Number(rounded);
}

export function verifySynchronizedMedia(value: unknown): asserts value is SynchronizedMedia {
  const item = object(value, "SynchronizedMedia") as unknown as SynchronizedMedia;
  assert(item.contract === "svml.synchronized-media@1", "SynchronizedMedia contract is invalid");
  verifyRational(item.timeline.frameRate, "SynchronizedMedia.timeline.frameRate");
  positiveInteger(item.timeline.frameCount, "SynchronizedMedia.timeline.frameCount");
  synchronizedMediaSampleFrames(item);
  assert(item.visual !== undefined || item.audio !== undefined, "SynchronizedMedia contains no media projection");
  if (item.visual !== undefined) {
    verifyBlob(item.visual.artifact, "SynchronizedMedia.visual.artifact");
    assert(item.visual.artifact.mediaType.startsWith("video/"), "SynchronizedMedia visual artifact is not video");
    positiveInteger(item.visual.width, "SynchronizedMedia.visual.width");
    positiveInteger(item.visual.height, "SynchronizedMedia.visual.height");
  }
  if (item.audio !== undefined) {
    verifyBlob(item.audio.artifact, "SynchronizedMedia.audio.artifact");
    assert(item.audio.artifact.mediaType === "audio/wav", "SynchronizedMedia audio artifact must be WAV");
  }
}

export function sealRenderedVisual(value: RenderedVisual): RenderedVisual {
  return canonicalize(value) as unknown as RenderedVisual;
}

export function verifyRenderedVisual(value: unknown): asserts value is RenderedVisual {
  const item = object(value, "RenderedVisual") as unknown as RenderedVisual;
  assert(item.contract === "svml.rendered-visual@1", "RenderedVisual contract is invalid");
  verifyRational(item.frameRate, "RenderedVisual.frameRate");
  positiveInteger(item.frameCount, "RenderedVisual.frameCount");
  positiveInteger(item.canvas?.width, "RenderedVisual.canvas.width");
  positiveInteger(item.canvas?.height, "RenderedVisual.canvas.height");
  verifyBlob(item.artifact, "RenderedVisual.artifact");
  assert(item.artifact.mediaType.startsWith("video/"), "RenderedVisual Artifact must be video");
  assert(item.muted === true, "RenderedVisual must be silent");
}

export function sealTimelineAudio(value: TimelineAudio): TimelineAudio {
  return canonicalize(value) as unknown as TimelineAudio;
}

export function verifyTimelineAudio(value: unknown): asserts value is TimelineAudio {
  const item = object(value, "TimelineAudio") as unknown as TimelineAudio;
  assert(item.contract === "svml.timeline-audio@1", "TimelineAudio contract is invalid");
  verifyBlob(item.artifact, "TimelineAudio.artifact");
  assert(item.artifact.mediaType === "audio/wav", "TimelineAudio Artifact must be WAV");
  assert(item.codec === "pcm_s16le" && item.sampleRate === 48_000 && item.channels === 2,
    "TimelineAudio PCM shape is invalid");
  positiveInteger(item.sampleFrames, "TimelineAudio.sampleFrames");
  assert(item.loudness === "planned", "TimelineAudio loudness claim is invalid");
}

export function sealMuxedMedia(value: MuxedMedia): MuxedMedia {
  return canonicalize(value) as unknown as MuxedMedia;
}

export function verifyMuxedMedia(value: unknown): asserts value is MuxedMedia {
  const item = object(value, "MuxedMedia") as unknown as MuxedMedia;
  assert(item.contract === "svml.muxed-media@1", "MuxedMedia contract is invalid");
  verifyRational(item.frameRate, "MuxedMedia.frameRate");
  positiveInteger(item.frameCount, "MuxedMedia.frameCount");
  positiveInteger(item.canvas?.width, "MuxedMedia.canvas.width");
  positiveInteger(item.canvas?.height, "MuxedMedia.canvas.height");
  assert(item.presentationSampleFrames === expectedSampleFrames(item.frameCount, item.frameRate),
    "MuxedMedia presentation sample count differs from its frame domain");
  verifyBlob(item.artifact, "MuxedMedia.artifact");
  assert(item.artifact.mediaType === "video/mp4", "MuxedMedia Artifact must be MP4");
}
