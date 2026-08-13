import { assertSpeechEvidenceAudioIdentity } from "@narratage/speech";
import { assertSpeechAudioBasisIdentity } from "@narratage/speech";
import type { SpeechAudioBasis, SpeechEvidenceAudio } from "@narratage/speech";
import type { WhisperXAlignmentRequest } from "./types.js";

export function whisperXRequestForEvidenceAudio(
  evidence: SpeechEvidenceAudio,
  basis: SpeechAudioBasis,
  options: { readonly language?: string } = {},
): WhisperXAlignmentRequest {
  assertSpeechEvidenceAudioIdentity(evidence);
  assertSpeechAudioBasisIdentity(basis);
  return {
    audio: evidence.artifact,
    sampleFrames: evidence.sampleFrames,
    segments: basis.segments,
    ...(options.language === undefined ? {} : { language: options.language }),
  };
}
