import { canonicalize } from "@hypit/protocol";

import { BT709_OPAQUE_PICTURE } from "./picture.js";
import {
  sealMediaStreamSelection,
  verifyMediaInspection,
  verifyPictureInterpretation,
} from "./identity.js";
import type {
  MediaAudioSelector,
  MediaAudioStream,
  MediaInspection,
  MediaSelectionRequest,
  MediaStreamSelection,
  MediaVideoSelector,
  MediaVideoStream,
  PictureInterpretation,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function sealMediaSelectionRequest(value: MediaSelectionRequest): MediaSelectionRequest {
  verifyMediaSelectionRequest(value);
  return canonicalize(value) as unknown as MediaSelectionRequest;
}

export function verifyMediaSelectionRequest(value: unknown): asserts value is MediaSelectionRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "MediaSelectionRequest must be an object");
  const item = value as MediaSelectionRequest;
  assert(item.video?.mode === "primary-moving" || item.video?.mode === "primary-picture"
    || item.video?.mode === "stream-index" || item.video?.mode === "none",
    "MediaSelectionRequest video mode is invalid");
  assert(item.audio?.mode === "default" || item.audio?.mode === "default-if-present"
    || item.audio?.mode === "stream-index" || item.audio?.mode === "none",
  "MediaSelectionRequest audio mode is invalid");
  if (item.video.mode === "stream-index") {
    assert(Number.isSafeInteger(item.video.streamIndex) && item.video.streamIndex >= 0,
      "MediaSelectionRequest video stream index is invalid");
  }
  if (item.audio.mode === "stream-index") {
    assert(Number.isSafeInteger(item.audio.streamIndex) && item.audio.streamIndex >= 0,
      "MediaSelectionRequest audio stream index is invalid");
  }
  assert(item.picture?.mode === "none" || item.picture?.mode === "source" || item.picture?.mode === "explicit",
    "MediaSelectionRequest picture mode is invalid");
  assert((item.video.mode === "none") === (item.picture.mode === "none"),
    "MediaSelectionRequest picture mode must be none exactly when video is disabled");
  if (item.picture.mode === "explicit") {
    verifyPictureInterpretation(item.picture.interpretation, "MediaSelectionRequest.picture.interpretation");
  }
  if (item.spanAuthority !== undefined) {
    assert(item.spanAuthority === "video" || item.spanAuthority === "audio",
      "MediaSelectionRequest authority is invalid");
    assert(item.spanAuthority === "video" ? item.video.mode !== "none" : item.audio.mode !== "none",
      "MediaSelectionRequest authority stream is disabled");
  }
}

export function namedPictureInterpretation(name: "sdr-bt709"): PictureInterpretation {
  if (name !== "sdr-bt709") throw new Error(`Unknown picture interpretation ${name}`);
  return structuredClone(BT709_OPAQUE_PICTURE);
}

function selectedPicture(video: MediaVideoStream, request: MediaSelectionRequest): PictureInterpretation {
  assert(request.picture.mode !== "none", "Selected video has no picture interpretation request");
  if (request.picture.mode === "explicit") return structuredClone(request.picture.interpretation);
  try {
    verifyPictureInterpretation(video.picture, `Video stream ${video.index} observed picture`);
  } catch (error) {
    throw new Error(
      `Video stream ${video.index} does not contain a complete picture interpretation; choose an explicit picture profile.`,
      { cause: error },
    );
  }
  return structuredClone(video.picture);
}

function selectUniqueDefault<T extends { readonly disposition: { readonly default: boolean }; readonly index: number }>(
  values: readonly T[],
  subject: string,
): T {
  assert(values.length > 0, `${subject} has no eligible stream`);
  const defaults = values.filter((item) => item.disposition.default);
  if (defaults.length === 1) return defaults[0]!;
  if (defaults.length > 1) {
    throw new Error(`${subject} has multiple default streams: ${defaults.map((item) => item.index).join(", ")}`);
  }
  if (values.length === 1) return values[0]!;
  throw new Error(`${subject} is ambiguous: ${values.map((item) => item.index).join(", ")}`);
}

export function selectVideoStream(
  inspection: MediaInspection,
  request: Exclude<MediaVideoSelector, { readonly mode: "none" }>,
): MediaVideoStream {
  verifyMediaInspection(inspection);
  const moving = inspection.streams.filter((stream): stream is MediaVideoStream =>
    stream.kind === "video"
      && stream.decodedUnitCount >= 2
      && stream.disposition.attachedPicture === false
      && stream.startPts !== undefined
      && stream.endPts !== undefined);
  if (request.mode === "primary-moving") return selectUniqueDefault(moving, "Primary moving video");
  if (request.mode === "primary-picture") {
    const pictures = inspection.streams.filter((stream): stream is MediaVideoStream =>
      stream.kind === "video" && stream.decodedUnitCount === 1 && stream.disposition.attachedPicture === false);
    return selectUniqueDefault(pictures, "Primary still picture");
  }
  const selected = inspection.streams.find((stream): stream is MediaVideoStream =>
    stream.kind === "video" && stream.index === request.streamIndex);
  assert(selected !== undefined, `Video stream ${request.streamIndex} does not exist`);
  assert(selected.decodedUnitCount >= 1 && selected.disposition.attachedPicture === false,
    `Video stream ${request.streamIndex} is not a usable picture stream`);
  if (selected.decodedUnitCount >= 2) assert(selected.startPts !== undefined && selected.endPts !== undefined,
    `Moving video stream ${request.streamIndex} has no presentation interval`);
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
  const audio = eligibleAudio(inspection);
  if (request.mode === "default") return selectUniqueDefault(audio, "Default audio");
  const selected = audio.find((stream) => stream.index === request.streamIndex);
  assert(selected !== undefined, `Audio stream ${request.streamIndex} does not exist or has no presentation interval`);
  return selected;
}

function selectOptionalAudio(
  inspection: MediaInspection,
  request: MediaAudioSelector,
): MediaAudioStream | undefined {
  if (request.mode === "none") return undefined;
  if (request.mode !== "default-if-present") return selectAudioStream(inspection, request);
  const audio = eligibleAudio(inspection);
  return audio.length === 0 ? undefined : selectUniqueDefault(audio, "Default audio");
}

/** Selects technical members only; their semantic role remains downstream. */
export function selectMediaStreams(
  inspection: MediaInspection,
  request: MediaSelectionRequest,
): MediaStreamSelection {
  verifyMediaInspection(inspection);
  verifyMediaSelectionRequest(request);
  const video = request.video.mode === "none" ? undefined : selectVideoStream(inspection, request.video);
  const audio = selectOptionalAudio(inspection, request.audio);
  assert(video !== undefined || audio !== undefined, "Media stream selection is empty");
  return sealMediaStreamSelection({
    ...(video === undefined ? {} : { videoStreamIndex: video.index, picture: selectedPicture(video, request) }),
    ...(audio === undefined ? {} : { audioStreamIndex: audio.index }),
    ...(request.spanAuthority === undefined ? {} : { spanAuthority: request.spanAuthority }),
  });
}
