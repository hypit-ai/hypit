import { pictureInterpretationProfile } from "./picture.js";
import { verifyMediaInspection, verifyPictureInterpretation } from "./validation.js";
import type {
  MediaAudioSelector,
  MediaAudioStream,
  MediaInspection,
  MediaPictureSelector,
  MediaPictureStream,
  MediaSelectionRequest,
  MediaStreamSelection,
  PictureInterpretation,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function verifyMediaSelectionRequest(value: unknown): asserts value is MediaSelectionRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "MediaSelectionRequest must be an object.");
  const item = value as MediaSelectionRequest;
  assert(item.picture?.mode === "primary-moving" || item.picture?.mode === "primary-picture"
    || item.picture?.mode === "stream-index" || item.picture?.mode === "none",
  "MediaSelectionRequest.picture mode is invalid.");
  assert(item.audio?.mode === "default" || item.audio?.mode === "default-if-present"
    || item.audio?.mode === "stream-index" || item.audio?.mode === "none",
  "MediaSelectionRequest.audio mode is invalid.");
  if (item.picture.mode === "stream-index") {
    assert(Number.isSafeInteger(item.picture.streamIndex) && item.picture.streamIndex >= 0,
      "MediaSelectionRequest picture stream index is invalid.");
  }
  if (item.audio.mode === "stream-index") {
    assert(Number.isSafeInteger(item.audio.streamIndex) && item.audio.streamIndex >= 0,
      "MediaSelectionRequest audio stream index is invalid.");
  }
  assert(item.pictureInterpretation?.mode === "none" || item.pictureInterpretation?.mode === "source"
    || item.pictureInterpretation?.mode === "explicit", "MediaSelectionRequest picture interpretation is invalid.");
  assert((item.picture.mode === "none") === (item.pictureInterpretation.mode === "none"),
    "Picture interpretation must be none exactly when picture is disabled.");
  if (item.pictureInterpretation.mode === "explicit") {
    verifyPictureInterpretation(item.pictureInterpretation.interpretation);
  }
  if (item.domainAuthority !== undefined) {
    assert(item.domainAuthority === "picture" || item.domainAuthority === "audio",
      "MediaSelectionRequest.domainAuthority is invalid.");
    assert(item.domainAuthority === "picture" ? item.picture.mode !== "none" : item.audio.mode !== "none",
      "MediaSelectionRequest domain authority is disabled.");
  }
}

function selectUniqueDefault<T extends { readonly disposition: { readonly default: boolean }; readonly index: number }>(
  values: readonly T[],
  subject: string,
): T {
  assert(values.length > 0, `${subject} has no eligible stream.`);
  const defaults = values.filter((item) => item.disposition.default);
  if (defaults.length === 1) return defaults[0]!;
  if (defaults.length > 1) throw new Error(`${subject} has multiple default streams: ${defaults.map((item) => item.index).join(", ")}.`);
  if (values.length === 1) return values[0]!;
  throw new Error(`${subject} is ambiguous: ${values.map((item) => item.index).join(", ")}.`);
}

export function selectPictureStream(
  inspection: MediaInspection,
  request: Exclude<MediaPictureSelector, { readonly mode: "none" }>,
): MediaPictureStream {
  verifyMediaInspection(inspection);
  if (request.mode === "primary-moving") {
    const candidates = inspection.streams.filter((stream): stream is MediaPictureStream =>
      stream.kind === "picture" && !stream.disposition.attachedPicture && stream.decodedUnitCount !== 1
      && stream.startPts !== undefined && stream.endPts !== undefined);
    return selectUniqueDefault(candidates, "Primary moving picture");
  }
  if (request.mode === "primary-picture") {
    const candidates = inspection.streams.filter((stream): stream is MediaPictureStream =>
      stream.kind === "picture" && !stream.disposition.attachedPicture && stream.decodedUnitCount === 1);
    return selectUniqueDefault(candidates, "Primary constant picture");
  }
  const selected = inspection.streams.find((stream): stream is MediaPictureStream =>
    stream.kind === "picture" && stream.index === request.streamIndex);
  assert(selected !== undefined && !selected.disposition.attachedPicture,
    `Picture stream ${request.streamIndex} does not exist or is an attached picture.`);
  if (selected.decodedUnitCount !== 1) {
    assert(selected.startPts !== undefined && selected.endPts !== undefined,
      `Moving picture stream ${request.streamIndex} has no presentation interval.`);
  }
  return selected;
}

function eligibleAudio(inspection: MediaInspection): readonly MediaAudioStream[] {
  return inspection.streams.filter((stream): stream is MediaAudioStream =>
    stream.kind === "audio" && stream.startPts !== undefined && stream.endPts !== undefined);
}

export function selectAudioStream(
  inspection: MediaInspection,
  request: Exclude<MediaAudioSelector, { readonly mode: "none" } | { readonly mode: "default-if-present" }>,
): MediaAudioStream {
  verifyMediaInspection(inspection);
  const candidates = eligibleAudio(inspection);
  if (request.mode === "default") return selectUniqueDefault(candidates, "Default audio");
  const selected = candidates.find((stream) => stream.index === request.streamIndex);
  assert(selected !== undefined, `Audio stream ${request.streamIndex} does not exist or has no presentation interval.`);
  return selected;
}

function selectedPictureInterpretation(
  stream: MediaPictureStream,
  request: MediaSelectionRequest,
): PictureInterpretation {
  assert(request.pictureInterpretation.mode !== "none", "Selected picture has no interpretation request.");
  if (request.pictureInterpretation.mode === "explicit") {
    return structuredClone(request.pictureInterpretation.interpretation);
  }
  try {
    verifyPictureInterpretation(stream.picture, `Picture stream ${stream.index}`);
  } catch (error) {
    throw new Error(`Picture stream ${stream.index} has no complete interpretation; select an explicit profile.`, { cause: error });
  }
  return structuredClone(stream.picture);
}

export function selectMediaStreams(
  inspection: MediaInspection,
  request: MediaSelectionRequest,
): MediaStreamSelection {
  verifyMediaInspection(inspection);
  verifyMediaSelectionRequest(request);
  const picture = request.picture.mode === "none" ? undefined : selectPictureStream(inspection, request.picture);
  let audio: MediaAudioStream | undefined;
  if (request.audio.mode === "default-if-present") {
    const candidates = eligibleAudio(inspection);
    audio = candidates.length === 0 ? undefined : selectUniqueDefault(candidates, "Default audio");
  } else if (request.audio.mode !== "none") audio = selectAudioStream(inspection, request.audio);
  assert(picture !== undefined || audio !== undefined, "Media stream selection is empty.");
  return {
    ...(picture === undefined ? {} : {
      pictureStreamIndex: picture.index,
      pictureInterpretation: selectedPictureInterpretation(picture, request),
    }),
    ...(audio === undefined ? {} : { audioStreamIndex: audio.index }),
    ...(request.domainAuthority === undefined ? {} : { domainAuthority: request.domainAuthority }),
  };
}

/** Explicit local adoption policy; callers may replace every choice. */
export function defaultMediaSelection(inspection: MediaInspection, mediaType: string): MediaSelectionRequest {
  verifyMediaInspection(inspection);
  const moving = inspection.streams.some((stream) => stream.kind === "picture"
    && !stream.disposition.attachedPicture && stream.decodedUnitCount !== 1
    && stream.startPts !== undefined && stream.endPts !== undefined);
  const constant = inspection.streams.some((stream) => stream.kind === "picture"
    && !stream.disposition.attachedPicture && stream.decodedUnitCount === 1);
  const picture = moving ? { mode: "primary-moving" as const }
    : constant ? { mode: "primary-picture" as const } : { mode: "none" as const };
  const hasAudio = eligibleAudio(inspection).length > 0;
  return {
    picture,
    audio: { mode: "default-if-present" },
    pictureInterpretation: picture.mode === "none" ? { mode: "none" }
      : { mode: "explicit", interpretation: pictureInterpretationProfile(mediaType.startsWith("image/") ? "srgb" : "sdr-bt709") },
    ...(moving ? { domainAuthority: "picture" as const }
      : hasAudio ? { domainAuthority: "audio" as const } : {}),
  };
}
