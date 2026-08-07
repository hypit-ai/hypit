import type { Narrative } from "@narratage/narrative";
import { sealMediaStreamSelection, verifyMediaInspection } from "@narratage/media";
import type { MediaAudioStream, MediaInspection, MediaStreamSelection, MediaVideoStream } from "@narratage/media";
import type { SpeechBasis } from "@narratage/speech";
import {
  canonicalize,
} from "@narratage/protocol";

import type { MediaSelectionRequest } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function sealMediaSelectionRequest(value: MediaSelectionRequest): MediaSelectionRequest {
  return canonicalize(value) as unknown as MediaSelectionRequest;
}

export function verifyMediaSelectionRequest(value: unknown): asserts value is MediaSelectionRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "MediaSelectionRequest must be an object");
  const item = value as MediaSelectionRequest;
  assert(item.contract === "svml.media-selection-request@1", "MediaSelectionRequest contract is invalid");
  assert(item.video?.mode === "primary-moving" || item.video?.mode === "stream-index" || item.video?.mode === "none",
    "MediaSelectionRequest video mode is invalid");
  assert(item.audio?.mode === "default" || item.audio?.mode === "stream-index" || item.audio?.mode === "none",
    "MediaSelectionRequest audio mode is invalid");
  if (item.video.mode === "stream-index") {
    assert(Number.isSafeInteger(item.video.streamIndex) && item.video.streamIndex >= 0,
      "MediaSelectionRequest video stream index is invalid");
  }
  if (item.audio.mode === "stream-index") {
    assert(Number.isSafeInteger(item.audio.streamIndex) && item.audio.streamIndex >= 0,
      "MediaSelectionRequest audio stream index is invalid");
  }
  assert(item.spanAuthority === "video" || item.spanAuthority === "audio", "MediaSelectionRequest authority is invalid");
  assert(item.spanAuthority === "video" ? item.video.mode !== "none" : item.audio.mode !== "none",
    "MediaSelectionRequest authority stream is disabled");
  assert(Number.isSafeInteger(item.frameRate?.numerator) && item.frameRate.numerator > 0
    && Number.isSafeInteger(item.frameRate?.denominator) && item.frameRate.denominator > 0,
  "MediaSelectionRequest frame rate is invalid");
}

function selectUniqueDefault<T extends { readonly disposition: { readonly default: boolean }; readonly index: number }>(
  values: readonly T[],
  subject: string,
): T {
  assert(values.length > 0, `${subject} has no eligible stream`);
  const defaults = values.filter((item) => item.disposition.default);
  if (defaults.length === 1) return defaults[0]!;
  if (defaults.length > 1) throw new Error(`${subject} has multiple default streams: ${defaults.map((item) => item.index).join(", ")}`);
  if (values.length === 1) return values[0]!;
  throw new Error(`${subject} is ambiguous: ${values.map((item) => item.index).join(", ")}`);
}

function selectedVideo(inspection: MediaInspection, request: MediaSelectionRequest): MediaVideoStream | undefined {
  if (request.video.mode === "none") return undefined;
  const videoRequest = request.video;
  const moving = inspection.streams.filter((stream): stream is MediaVideoStream =>
    stream.kind === "video"
      && stream.role === "moving"
      && stream.disposition.attachedPicture === false
      && stream.timingStatus === "admissible"
      && stream.startPts !== undefined
      && stream.endPts !== undefined);
  if (videoRequest.mode === "primary-moving") return selectUniqueDefault(moving, "Primary moving video");
  const selected = inspection.streams.find((stream): stream is MediaVideoStream =>
    stream.kind === "video" && stream.index === videoRequest.streamIndex);
  assert(selected !== undefined, `Video stream ${videoRequest.streamIndex} does not exist`);
  assert(selected.role === "moving" && selected.disposition.attachedPicture === false,
    `Video stream ${videoRequest.streamIndex} is not a moving visual stream`);
  assert(selected.timingStatus === "admissible", `Video stream ${videoRequest.streamIndex} timing is not admissible`);
  assert(selected.startPts !== undefined && selected.endPts !== undefined,
    `Video stream ${videoRequest.streamIndex} has no presentation interval`);
  return selected;
}

function selectedAudio(inspection: MediaInspection, request: MediaSelectionRequest): MediaAudioStream | undefined {
  if (request.audio.mode === "none") return undefined;
  const audioRequest = request.audio;
  const audio = inspection.streams.filter((stream): stream is MediaAudioStream =>
    stream.kind === "audio" && stream.timingStatus === "admissible"
      && stream.startPts !== undefined && stream.endPts !== undefined);
  if (audioRequest.mode === "default") return selectUniqueDefault(audio, "Default audio");
  const selected = audio.find((stream) => stream.index === audioRequest.streamIndex);
  assert(selected !== undefined, `Audio stream ${audioRequest.streamIndex} does not exist or has no presentation interval`);
  return selected;
}

/**
 * Selects container streams only. Choosing an audio stream never claims that it is narrated speech;
 * SpeechBasis construction remains a separate semantic Producer with an explicit Narrative edge.
 */
export function selectMediaStreams(
  inspection: MediaInspection,
  request: MediaSelectionRequest,
): MediaStreamSelection {
  verifyMediaInspection(inspection);
  verifyMediaSelectionRequest(request);
  const video = selectedVideo(inspection, request);
  const audio = selectedAudio(inspection, request);
  assert(video !== undefined || audio !== undefined, "Media stream selection is empty");
  const policy = request.video.mode === "stream-index" || request.audio.mode === "stream-index"
    ? "explicit-streams@1" as const
    : video !== undefined && audio !== undefined
      ? "primary-moving-default-audio@1" as const
      : video !== undefined ? "primary-moving@1" as const : "default-audio@1" as const;
  return sealMediaStreamSelection({
    contract: "svml.media-stream-selection@1",
    ...(video === undefined ? {} : { videoStreamIndex: video.index }),
    ...(audio === undefined ? {} : { audioStreamIndex: audio.index }),
    spanAuthority: request.spanAuthority,
    policy,
  });
}
