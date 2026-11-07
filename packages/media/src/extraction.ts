import { canonicalize } from "@hypit/protocol";

import type {
  AudioExtractionRequest,
  FrameExtractionRequest,
  MediaAudioSelector,
  MediaVideoSelector,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function index(value: unknown, subject: string): number {
  assert(Number.isSafeInteger(value) && (value as number) >= 0, `${subject} must be a non-negative integer`);
  return value as number;
}

function verifyVideoSelector(value: unknown, subject: string): asserts value is MediaVideoSelector {
  const selector = object(value, subject);
  assert(selector.mode === "primary-moving" || selector.mode === "stream-index", `${subject}.mode is invalid`);
  if (selector.mode === "stream-index") index(selector.streamIndex, `${subject}.streamIndex`);
}

function verifyAudioSelector(value: unknown, subject: string): asserts value is MediaAudioSelector {
  const selector = object(value, subject);
  assert(selector.mode === "default" || selector.mode === "stream-index", `${subject}.mode is invalid`);
  if (selector.mode === "stream-index") index(selector.streamIndex, `${subject}.streamIndex`);
}

export function verifyAudioExtractionRequest(value: unknown): asserts value is AudioExtractionRequest {
  const request = object(value, "AudioExtractionRequest");
  verifyAudioSelector(request.audio, "AudioExtractionRequest.audio");
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
  if (at.kind === "frame") index(at.index, "FrameExtractionRequest.at.index");
  if (at.kind === "time") {
    assert(typeof at.seconds === "number" && Number.isFinite(at.seconds) && at.seconds >= 0,
      "FrameExtractionRequest.at.seconds must be finite and non-negative");
  }
}

export function sealFrameExtractionRequest(value: FrameExtractionRequest): FrameExtractionRequest {
  const result = canonicalize(value) as unknown as FrameExtractionRequest;
  verifyFrameExtractionRequest(result);
  return result;
}
