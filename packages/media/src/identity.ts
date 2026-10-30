import {
  assertBlobRef,
  canonicalize,
} from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";
import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  assertTemporalMap,
  compareExactTemporalValues,
} from "@hypit/temporal";

import type {
  MediaInspection,
  MuxedMedia,
  MediaRational,
  TimelineVisual,
  MediaStream,
  MediaStreamSelection,
  MediaTimestamp,
  MediaDeliverySpec,
  MediaDomainSpec,
  OutputPictureSpec,
  PictureSignal,
  PictureInterpretation,
  PictureObservation,
  PreparedAudioMember,
  PreparedMedia,
  PreparedAudioSource,
  PreparedVisualSource,
  PreparedVisualMember,
  TimelineAudio,
  VisualDeliverySpec,
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

function verifyHexColor(value: unknown, subject: string): asserts value is string {
  assert(typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value), `${subject} must be an opaque hexadecimal color`);
}

export function verifyMediaDomainSpec(value: unknown): asserts value is MediaDomainSpec {
  const item = object(value, "MediaDomainSpec");
  assert(typeof item.id === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(item.id),
    "MediaDomainSpec.id is invalid");
}

export function sealVisualDeliverySpec(value: VisualDeliverySpec): VisualDeliverySpec {
  verifyVisualDeliverySpec(value);
  return canonicalize(value) as unknown as VisualDeliverySpec;
}

export function sealOutputPictureSpec<T extends OutputPictureSpec>(value: T): T {
  verifyOutputPictureSpec(value);
  return canonicalize(value) as unknown as T;
}

const PRIMARIES = ["bt709"] as const;
const TRANSFERS = ["srgb", "bt709"] as const;
const MATRICES = ["rgb", "bt709"] as const;
const RANGES = ["full", "limited"] as const;
const BIT_DEPTHS = [8] as const;
const ALPHA_MODES = ["opaque", "straight", "premultiplied"] as const;

function oneOf<T extends string | number>(value: unknown, options: readonly T[], subject: string): asserts value is T {
  assert(options.includes(value as T), `${subject} is invalid`);
}

export function verifyPictureSignal(value: unknown, subject = "PictureSignal"): asserts value is PictureSignal {
  const picture = object(value, subject) as unknown as PictureSignal;
  const image = picture.colorPrimaries === "bt709" && picture.colorTransfer === "srgb"
    && picture.colorMatrix === "rgb" && picture.colorRange === "full" && picture.bitDepth === 8;
  const video = picture.colorPrimaries === "bt709" && picture.colorTransfer === "bt709"
    && picture.colorMatrix === "bt709" && picture.colorRange === "limited" && picture.bitDepth === 8;
  assert(image || video, `${subject} is not an implemented SDR picture signal`);
}

export function verifyPictureInterpretation(
  value: unknown,
  subject = "PictureInterpretation",
): asserts value is PictureInterpretation {
  verifyPictureSignal(value, subject);
  const picture = value as PictureInterpretation;
  assert(picture.alphaMode === "opaque" || picture.alphaMode === "straight",
    `${subject}.alphaMode is not implemented`);
}

export function verifyPictureObservation(value: unknown, subject = "PictureObservation"): asserts value is PictureObservation {
  const picture = object(value, subject) as PictureObservation;
  if (picture.colorPrimaries !== undefined) oneOf(picture.colorPrimaries, PRIMARIES, `${subject}.colorPrimaries`);
  if (picture.colorTransfer !== undefined) oneOf(picture.colorTransfer, TRANSFERS, `${subject}.colorTransfer`);
  if (picture.colorMatrix !== undefined) oneOf(picture.colorMatrix, MATRICES, `${subject}.colorMatrix`);
  if (picture.colorRange !== undefined) oneOf(picture.colorRange, RANGES, `${subject}.colorRange`);
  if (picture.bitDepth !== undefined) oneOf(picture.bitDepth, BIT_DEPTHS, `${subject}.bitDepth`);
  if (picture.alphaMode !== undefined) oneOf(picture.alphaMode, ALPHA_MODES, `${subject}.alphaMode`);
}

export function verifyOutputPictureSpec(value: unknown): asserts value is OutputPictureSpec {
  const picture = object(value, "OutputPictureSpec") as unknown as OutputPictureSpec;
  verifyPictureSignal(picture, "OutputPictureSpec");
  const signal = picture as PictureSignal;
  const image = signal.colorPrimaries === "bt709" && signal.colorTransfer === "srgb"
    && signal.colorMatrix === "rgb" && signal.colorRange === "full" && signal.bitDepth === 8;
  const video = signal.colorPrimaries === "bt709" && signal.colorTransfer === "bt709"
    && signal.colorMatrix === "bt709" && signal.colorRange === "limited" && signal.bitDepth === 8;
  assert(image || video, "OutputPictureSpec color interpretation is invalid");
  const alpha = object(picture.alpha, "OutputPictureSpec.alpha") as unknown as OutputPictureSpec["alpha"];
  assert(alpha.mode === "opaque", "OutputPictureSpec alpha mode must be opaque");
  verifyHexColor(alpha.matte, "OutputPictureSpec.alpha.matte");
}

export function sameOutputPictureSpec(left: OutputPictureSpec, right: OutputPictureSpec): boolean {
  verifyOutputPictureSpec(left);
  verifyOutputPictureSpec(right);
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

export function verifyVisualDeliverySpec(value: unknown): asserts value is VisualDeliverySpec {
  const item = object(value, "VisualDeliverySpec") as unknown as VisualDeliverySpec;
  verifyOutputPictureSpec(item.picture);
  assert(item.picture.colorRange === "limited",
    "VisualDeliverySpec picture must use a video interpretation");
  const encoding = object(item.encoding, "VisualDeliverySpec.encoding") as unknown as VisualDeliverySpec["encoding"];
  assert(encoding.codec === "h264", "VisualDeliverySpec.encoding.codec must be h264");
  assert(encoding.pixelFormat === "yuv420p", "VisualDeliverySpec.encoding.pixelFormat must be yuv420p");
  assert(encoding.quality === "draft" || encoding.quality === "standard" || encoding.quality === "high",
    "VisualDeliverySpec quality is unsupported");
}

export function sealMediaDeliverySpec(value: MediaDeliverySpec): MediaDeliverySpec {
  verifyMediaDeliverySpec(value);
  return canonicalize(value) as unknown as MediaDeliverySpec;
}

export function verifyMediaDeliverySpec(value: unknown): asserts value is MediaDeliverySpec {
  const item = object(value, "MediaDeliverySpec") as unknown as MediaDeliverySpec;
  verifyVisualDeliverySpec(item.visual);
  const audio = object(item.audio, "MediaDeliverySpec.audio") as unknown as MediaDeliverySpec["audio"];
  assert(audio.codec === "aac", "MediaDeliverySpec audio codec is unsupported");
  assert(audio.sampleRate === 48_000, "MediaDeliverySpec audio sample rate is unsupported");
  assert(audio.channelLayout === "stereo", "MediaDeliverySpec audio channel layout is unsupported");
  assert(item.container === "mp4", "MediaDeliverySpec container is unsupported");
}

export function projectVisualDeliverySpec(value: MediaDeliverySpec): VisualDeliverySpec {
  verifyMediaDeliverySpec(value);
  return sealVisualDeliverySpec(value.visual);
}

export function sameVisualDeliverySpec(left: VisualDeliverySpec, right: VisualDeliverySpec): boolean {
  verifyVisualDeliverySpec(left);
  verifyVisualDeliverySpec(right);
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
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
  assertBlobRef(value, subject);
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
    verifyPictureObservation(item.picture, `${subject}.picture`);
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
  verifyMediaInspection(value);
  return canonicalize(value) as unknown as MediaInspection;
}

export function verifyMediaInspection(value: unknown): asserts value is MediaInspection {
  const item = object(value, "MediaInspection") as unknown as MediaInspection;
  assert(Array.isArray(item.container?.formatNames), "MediaInspection container formats are invalid");
  item.container.formatNames.forEach((format) => assert(typeof format === "string" && format.length > 0,
    "MediaInspection container format is invalid"));
  assert(Array.isArray(item.streams), "MediaInspection streams are invalid");
  item.streams.forEach((stream, index) => verifyStream(stream, `MediaInspection.streams[${index}]`));
  assert(new Set(item.streams.map((stream) => stream.index)).size === item.streams.length,
    "MediaInspection repeats a stream index");
}

export function sealMediaStreamSelection(value: MediaStreamSelection): MediaStreamSelection {
  verifyMediaStreamSelection(value);
  return canonicalize(value) as unknown as MediaStreamSelection;
}

export function verifyMediaStreamSelection(value: unknown): asserts value is MediaStreamSelection {
  const item = object(value, "MediaStreamSelection") as unknown as MediaStreamSelection;
  if (item.videoStreamIndex !== undefined) nonNegativeInteger(item.videoStreamIndex, "MediaStreamSelection.videoStreamIndex");
  if (item.audioStreamIndex !== undefined) nonNegativeInteger(item.audioStreamIndex, "MediaStreamSelection.audioStreamIndex");
  assert(item.videoStreamIndex !== undefined || item.audioStreamIndex !== undefined,
    "MediaStreamSelection selects no stream");
  assert(item.spanAuthority === "video" || item.spanAuthority === "audio", "MediaStreamSelection authority is invalid");
  assert(item.spanAuthority === "video" ? item.videoStreamIndex !== undefined : item.audioStreamIndex !== undefined,
    "MediaStreamSelection authority stream is absent");
  assert((item.videoStreamIndex === undefined) === (item.picture === undefined),
    "MediaStreamSelection visual picture must exist exactly when a video stream is selected");
  if (item.picture !== undefined) verifyPictureInterpretation(item.picture, "MediaStreamSelection.picture");
}

function verifyPreparedMember(
  member: PreparedVisualMember | PreparedAudioMember,
  preparedDomain: import("@hypit/temporal").LocalTemporalDomain,
  label: string,
): void {
  nonNegativeInteger(member.streamIndex, `${label}.streamIndex`);
  assertExactTemporalValue(member.presentationStart, `${label}.presentationStart`);
  assertLocalTemporalDomain(member.sourceDomain);
  assertTemporalMap(member.map);
  assert(member.map.stages[0]?.target.id === preparedDomain.id
    && compareExactTemporalValues(member.map.stages[0].target.duration, preparedDomain.duration) === 0,
  `${label}.map does not begin at the PreparedMedia domain.`);
  assert(member.map.stages.at(-1)?.source.id === member.sourceDomain.id
    && compareExactTemporalValues(member.map.stages.at(-1)!.source.duration, member.sourceDomain.duration) === 0,
  `${label}.map does not end at its source domain.`);
}

export function sealPreparedMedia(value: PreparedMedia): PreparedMedia {
  verifyPreparedMedia(value);
  return canonicalize(value) as unknown as PreparedMedia;
}

export function verifyPreparedMedia(value: unknown): asserts value is PreparedMedia {
  const item = object(value, "PreparedMedia") as unknown as PreparedMedia;
  verifyBlob(item.source, "PreparedMedia.source");
  assertLocalTemporalDomain(item.domain);
  assert(item.visual !== undefined || item.audio !== undefined, "PreparedMedia selects no media member");
  if (item.visual !== undefined) {
    const visual = object(item.visual, "PreparedMedia.visual") as unknown as PreparedVisualMember;
    verifyPreparedMember(visual, item.domain, "PreparedMedia.visual");
    const interpretation = object(visual.interpretation, "PreparedMedia.visual.interpretation");
    positiveInteger(interpretation.codedWidth, "PreparedMedia.visual.interpretation.codedWidth");
    positiveInteger(interpretation.codedHeight, "PreparedMedia.visual.interpretation.codedHeight");
    verifyRational(interpretation.sampleAspectRatio, "PreparedMedia.visual.interpretation.sampleAspectRatio");
    assert(interpretation.rotationDegrees === 0 || interpretation.rotationDegrees === 90
      || interpretation.rotationDegrees === 180 || interpretation.rotationDegrees === 270,
    "PreparedMedia.visual.interpretation.rotationDegrees is invalid");
    verifyPictureInterpretation(interpretation.picture, "PreparedMedia.visual.interpretation.picture");
  }
  if (item.audio !== undefined) {
    const audio = object(item.audio, "PreparedMedia.audio") as unknown as PreparedAudioMember;
    verifyPreparedMember(audio, item.domain, "PreparedMedia.audio");
    const interpretation = object(audio.interpretation, "PreparedMedia.audio.interpretation");
    positiveInteger(interpretation.sampleRate, "PreparedMedia.audio.interpretation.sampleRate");
    positiveInteger(interpretation.channels, "PreparedMedia.audio.interpretation.channels");
    if (interpretation.channelLayout !== undefined) {
      assert(typeof interpretation.channelLayout === "string" && interpretation.channelLayout.length > 0,
        "PreparedMedia.audio.interpretation.channelLayout is invalid");
    }
  }
}

export function verifyPreparedVisualSource(value: unknown): asserts value is PreparedVisualSource {
  const item = object(value, "PreparedVisualSource") as unknown as PreparedVisualSource;
  verifyBlob(item.source, "PreparedVisualSource.source");
  nonNegativeInteger(item.streamIndex, "PreparedVisualSource.streamIndex");
  assertExactTemporalValue(item.presentationStart, "PreparedVisualSource.presentationStart");
  assertLocalTemporalDomain(item.sourceDomain);
  const interpretation = object(item.interpretation, "PreparedVisualSource.interpretation");
  positiveInteger(interpretation.codedWidth, "PreparedVisualSource.interpretation.codedWidth");
  positiveInteger(interpretation.codedHeight, "PreparedVisualSource.interpretation.codedHeight");
  verifyRational(interpretation.sampleAspectRatio, "PreparedVisualSource.interpretation.sampleAspectRatio");
  assert(interpretation.rotationDegrees === 0 || interpretation.rotationDegrees === 90
    || interpretation.rotationDegrees === 180 || interpretation.rotationDegrees === 270,
  "PreparedVisualSource.interpretation.rotationDegrees is invalid");
  verifyPictureInterpretation(interpretation.picture, "PreparedVisualSource.interpretation.picture");
}

export function verifyPreparedAudioSource(value: unknown): asserts value is PreparedAudioSource {
  const item = object(value, "PreparedAudioSource") as unknown as PreparedAudioSource;
  verifyBlob(item.source, "PreparedAudioSource.source");
  nonNegativeInteger(item.streamIndex, "PreparedAudioSource.streamIndex");
  assertExactTemporalValue(item.presentationStart, "PreparedAudioSource.presentationStart");
  assertLocalTemporalDomain(item.sourceDomain);
  const interpretation = object(item.interpretation, "PreparedAudioSource.interpretation");
  positiveInteger(interpretation.sampleRate, "PreparedAudioSource.interpretation.sampleRate");
  positiveInteger(interpretation.channels, "PreparedAudioSource.interpretation.channels");
  if (interpretation.channelLayout !== undefined) {
    assert(typeof interpretation.channelLayout === "string" && interpretation.channelLayout.length > 0,
      "PreparedAudioSource.interpretation.channelLayout is invalid");
  }
}

export function sealTimelineVisual(value: TimelineVisual): TimelineVisual {
  verifyTimelineVisual(value);
  return canonicalize(value) as unknown as TimelineVisual;
}

export function verifyTimelineVisual(value: unknown): asserts value is TimelineVisual {
  const item = object(value, "TimelineVisual") as unknown as TimelineVisual;
  verifyRational(item.frameRate, "TimelineVisual.frameRate");
  positiveInteger(item.frameCount, "TimelineVisual.frameCount");
  positiveInteger(item.canvas?.width, "TimelineVisual.canvas.width");
  positiveInteger(item.canvas?.height, "TimelineVisual.canvas.height");
  verifyVisualDeliverySpec(item.delivery);
  verifyBlob(item.artifact, "TimelineVisual.artifact");
  assert(item.artifact.mediaType.startsWith("video/"), "TimelineVisual Artifact must be video");
}

export function sealTimelineAudio(value: TimelineAudio): TimelineAudio {
  verifyTimelineAudio(value);
  return canonicalize(value) as unknown as TimelineAudio;
}

export function verifyTimelineAudio(value: unknown): asserts value is TimelineAudio {
  const item = object(value, "TimelineAudio") as unknown as TimelineAudio;
  verifyBlob(item.artifact, "TimelineAudio.artifact");
  assert(item.artifact.mediaType === "audio/wav", "TimelineAudio Artifact must be WAV");
  assert(item.sampleRate === 48_000, "TimelineAudio sample rate must be 48 kHz");
  assert(item.channelLayout === "stereo", "TimelineAudio channel layout must be stereo");
  positiveInteger(item.sampleFrames, "TimelineAudio.sampleFrames");
}

export function sealMuxedMedia(value: MuxedMedia): MuxedMedia {
  verifyMuxedMedia(value);
  return canonicalize(value) as unknown as MuxedMedia;
}

export function verifyMuxedMedia(value: unknown): asserts value is MuxedMedia {
  const item = object(value, "MuxedMedia") as unknown as MuxedMedia;
  verifyRational(item.frameRate, "MuxedMedia.frameRate");
  positiveInteger(item.frameCount, "MuxedMedia.frameCount");
  positiveInteger(item.canvas?.width, "MuxedMedia.canvas.width");
  positiveInteger(item.canvas?.height, "MuxedMedia.canvas.height");
  assert(item.presentationSampleFrames === expectedSampleFrames(item.frameCount, item.frameRate),
    "MuxedMedia presentation sample count differs from its frame domain");
  verifyBlob(item.artifact, "MuxedMedia.artifact");
  verifyMediaDeliverySpec(item.delivery);
  assert(item.artifact.mediaType === "video/mp4", "MuxedMedia Artifact must be MP4");
}
