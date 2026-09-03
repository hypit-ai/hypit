import { assertSpeechEvidenceAudioIdentity } from "@hypit/speech";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import type { WhisperXAlignmentRequest, WhisperXLanguage } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Verify the Provider-neutral request carried by the WhisperX alignment capability. */
export function verifyWhisperXAlignmentRequest(value: unknown): WhisperXAlignmentRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "WhisperX alignment request must be an object");
  const request = value as WhisperXAlignmentRequest;
  assert(request.audio?.kind === "blob"
    && request.audio.mediaType === "audio/wav"
    && Number.isSafeInteger(request.sampleFrames)
    && request.sampleFrames > 0
    && (request.language === "en" || request.language === "zh" || request.language === "es"),
  "WhisperX alignment request is invalid");
  return request;
}

function fourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/** Refuse evidence bytes that would require a Provider to normalize audio a second time. */
export function assertWhisperXEvidenceWav(bytes: Uint8Array, sampleFrames: number): void {
  assert(bytes.byteLength >= 44 && fourCc(bytes, 0) === "RIFF" && fourCc(bytes, 8) === "WAVE",
    "WhisperX evidence Artifact is not a WAV file");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format: { readonly codec: number; readonly channels: number; readonly sampleRate: number; readonly bits: number }
    | undefined;
  let dataBytes: number | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const name = fourCc(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    assert(body + size <= bytes.byteLength, "WhisperX evidence WAV has a truncated chunk");
    if (name === "fmt ") {
      assert(size >= 16, "WhisperX evidence WAV fmt chunk is invalid");
      format = {
        codec: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (name === "data") {
      dataBytes = size;
    }
    offset = body + size + (size % 2);
  }
  assert(format?.codec === 1 && format.channels === 1 && format.sampleRate === 16_000 && format.bits === 16,
    "WhisperX evidence must be 16 kHz mono PCM s16 WAV");
  assert(dataBytes === sampleFrames * 2, "WhisperX evidence sample count differs from its contract");
}

export function whisperXRequestForEvidenceAudio(
  evidence: SpeechEvidenceAudio,
  options: { readonly language: WhisperXLanguage },
): WhisperXAlignmentRequest {
  assertSpeechEvidenceAudioIdentity(evidence);
  return {
    audio: evidence.artifact,
    sampleFrames: evidence.sampleFrames,
    language: options.language,
  };
}
