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
} from "@hypit/temporal/algebra";

import type {
  MediaInspection,
  MuxedMedia,
  MediaRational,
  RenderedVisual,
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
  PreparedPictureSource,
  PreparedPictureMember,
  PreparedSignalPictureMember,
  PreparedSignalPictureSource,
  RenderedAudio,
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
  assert(typeof item.codecName === "string" && item.codecName.length > 0, `${subject}.codecName is invalid`);
  const disposition = object(item.disposition, `${subject}.disposition`);
  assert(typeof disposition.default === "boolean", `${subject}.disposition.default is invalid`);
  assert(typeof disposition.attachedPicture === "boolean", `${subject}.disposition.attachedPicture is invalid`);
  if (item.startPts !== undefined) verifyTimestamp(item.startPts, `${subject}.startPts`);
  if (item.endPts !== undefined) verifyTimestamp(item.endPts, `${subject}.endPts`);
  assert((item.startPts === undefined) === (item.endPts === undefined), `${subject} must provide both presentation endpoints`);
  if (item.startPts !== undefined && item.endPts !== undefined) {
    assert(compareTimestamp(item.startPts, item.endPts) < 0, `${subject} presentation interval is empty or reversed`);
  }
  if (item.kind === "video") {
    nonNegativeInteger(item.decodedUnitCount, `${subject}.decodedUnitCount`);
    positiveInteger(item.width, `${subject}.width`);
    positiveInteger(item.height, `${subject}.height`);
    verifyRational(item.sampleAspectRatio, `${subject}.sampleAspectRatio`);
    assert(item.rotationDegrees === 0 || item.rotationDegrees === 90
      || item.rotationDegrees === 180 || item.rotationDegrees === 270,
    `${subject}.rotationDegrees is invalid`);
    if (item.averageFrameRate !== undefined) verifyRational(item.averageFrameRate, `${subject}.averageFrameRate`);
    verifyPictureObservation(item.picture, `${subject}.picture`);
  } else if (item.kind === "audio") {
    positiveInteger(item.sampleRate, `${subject}.sampleRate`);
    positiveInteger(item.channels, `${subject}.channels`);
    nonNegativeInteger(item.decodedSampleFrames, `${subject}.decodedSampleFrames`);
  } else {
    assert(item.kind === "other", `${subject}.kind is invalid`);
    assert(typeof item.codecType === "string" && item.codecType.length > 0, `${subject}.codecType is invalid`);
  }
}

export function sealMediaInspection(value: MediaInspection): MediaInspection {
  verifyMediaInspection(value);
  return canonicalize(value) as unknown as MediaInspection;
}

export function verifyMediaInspection(value: unknown): asserts value is MediaInspection {
  const item = object(value, "MediaInspection") as unknown as MediaInspection;
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
  if (item.spanAuthority !== undefined) {
    assert(item.spanAuthority === "video" || item.spanAuthority === "audio", "MediaStreamSelection authority is invalid");
    assert(item.spanAuthority === "video" ? item.videoStreamIndex !== undefined : item.audioStreamIndex !== undefined,
      "MediaStreamSelection authority stream is absent");
  }
  assert((item.videoStreamIndex === undefined) === (item.picture === undefined),
    "MediaStreamSelection visual picture must exist exactly when a video stream is selected");
  if (item.picture !== undefined) verifyPictureInterpretation(item.picture, "MediaStreamSelection.picture");
}

function verifyPreparedMember(
  member: PreparedSignalPictureMember | PreparedAudioMember,
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
  assert(typeof item.id === "string" && /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(item.id),
    "PreparedMedia.id is invalid");
  verifyBlob(item.source, "PreparedMedia.source");
  if (item.domain !== undefined) assertLocalTemporalDomain(item.domain);
  assert(item.picture !== undefined || item.audio !== undefined, "PreparedMedia selects no media member");
  if (item.picture !== undefined) {
    const picture = object(item.picture, "PreparedMedia.picture") as unknown as PreparedPictureMember;
    assert(picture.kind === "constant" || picture.kind === "signal", "PreparedMedia.picture kind is invalid");
    nonNegativeInteger(picture.streamIndex, "PreparedMedia.picture.streamIndex");
    if (picture.kind === "signal") {
      assert(item.domain !== undefined, "PreparedMedia signal Picture has no temporal domain");
      verifyPreparedMember(picture, item.domain, "PreparedMedia.picture");
    }
    const interpretation = object(picture.interpretation, "PreparedMedia.picture.interpretation");
    positiveInteger(interpretation.codedWidth, "PreparedMedia.picture.interpretation.codedWidth");
    positiveInteger(interpretation.codedHeight, "PreparedMedia.picture.interpretation.codedHeight");
    verifyRational(interpretation.sampleAspectRatio, "PreparedMedia.picture.interpretation.sampleAspectRatio");
    assert(interpretation.rotationDegrees === 0 || interpretation.rotationDegrees === 90
      || interpretation.rotationDegrees === 180 || interpretation.rotationDegrees === 270,
    "PreparedMedia.picture.interpretation.rotationDegrees is invalid");
    verifyPictureInterpretation(interpretation.picture, "PreparedMedia.picture.interpretation.picture");
  }
  if (item.audio !== undefined) {
    assert(item.domain !== undefined, "PreparedMedia Audio has no temporal domain");
    const audio = object(item.audio, "PreparedMedia.audio") as unknown as PreparedAudioMember;
    verifyPreparedMember(audio, item.domain, "PreparedMedia.audio");
  }
  assert(item.domain !== undefined || item.picture?.kind === "constant",
    "PreparedMedia without temporal signals must contain a constant Picture");
}

export function verifyPreparedPictureSource(value: unknown): asserts value is PreparedPictureSource {
  const item = object(value, "PreparedPictureSource") as unknown as PreparedPictureSource;
  verifyBlob(item.source, "PreparedPictureSource.source");
  assert(item.kind === "constant" || item.kind === "signal", "PreparedPictureSource.kind is invalid");
  nonNegativeInteger(item.streamIndex, "PreparedPictureSource.streamIndex");
  if (item.kind === "signal") {
    assertExactTemporalValue(item.presentationStart, "PreparedPictureSource.presentationStart");
    assertLocalTemporalDomain(item.sourceDomain);
  }
  const interpretation = object(item.interpretation, "PreparedPictureSource.interpretation");
  positiveInteger(interpretation.codedWidth, "PreparedPictureSource.interpretation.codedWidth");
  positiveInteger(interpretation.codedHeight, "PreparedPictureSource.interpretation.codedHeight");
  verifyRational(interpretation.sampleAspectRatio, "PreparedPictureSource.interpretation.sampleAspectRatio");
  assert(interpretation.rotationDegrees === 0 || interpretation.rotationDegrees === 90
    || interpretation.rotationDegrees === 180 || interpretation.rotationDegrees === 270,
  "PreparedPictureSource.interpretation.rotationDegrees is invalid");
  verifyPictureInterpretation(interpretation.picture, "PreparedPictureSource.interpretation.picture");
}

export function verifyPreparedSignalPictureSource(value: unknown): asserts value is PreparedSignalPictureSource {
  verifyPreparedPictureSource(value);
  assert(value.kind === "signal", "PreparedSignalPictureSource is not a temporal signal");
}

export function verifyPreparedAudioSource(value: unknown): asserts value is PreparedAudioSource {
  const item = object(value, "PreparedAudioSource") as unknown as PreparedAudioSource;
  verifyBlob(item.source, "PreparedAudioSource.source");
  nonNegativeInteger(item.streamIndex, "PreparedAudioSource.streamIndex");
  assertExactTemporalValue(item.presentationStart, "PreparedAudioSource.presentationStart");
  assertLocalTemporalDomain(item.sourceDomain);
}

export function sealRenderedVisual(value: RenderedVisual): RenderedVisual {
  verifyRenderedVisual(value);
  return canonicalize(value) as unknown as RenderedVisual;
}

export function verifyRenderedVisual(value: unknown): asserts value is RenderedVisual {
  const item = object(value, "RenderedVisual") as unknown as RenderedVisual;
  verifyRational(item.frameRate, "RenderedVisual.frameRate");
  positiveInteger(item.frameCount, "RenderedVisual.frameCount");
  positiveInteger(item.canvas?.width, "RenderedVisual.canvas.width");
  positiveInteger(item.canvas?.height, "RenderedVisual.canvas.height");
  verifyVisualDeliverySpec(item.delivery);
  verifyBlob(item.artifact, "RenderedVisual.artifact");
  assert(item.artifact.mediaType.startsWith("video/"), "RenderedVisual Artifact must be video");
}

export function sealRenderedAudio(value: RenderedAudio): RenderedAudio {
  verifyRenderedAudio(value);
  return canonicalize(value) as unknown as RenderedAudio;
}

export function verifyRenderedAudio(value: unknown): asserts value is RenderedAudio {
  const item = object(value, "RenderedAudio") as unknown as RenderedAudio;
  verifyBlob(item.artifact, "RenderedAudio.artifact");
  assert(item.artifact.mediaType === "audio/wav", "RenderedAudio Artifact must be WAV");
  positiveInteger(item.sampleFrames, "RenderedAudio.sampleFrames");
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
  verifyBlob(item.artifact, "MuxedMedia.artifact");
  verifyMediaDeliverySpec(item.delivery);
  assert(item.artifact.mediaType === "video/mp4", "MuxedMedia Artifact must be MP4");
}
