import {
  assertSpeechEvidenceAudioIdentity,
  sealAlignedTranscriptEvidence,
} from "@svml/contracts";
import type { AlignedTranscriptEvidence, SpeechEvidenceAudio } from "@svml/contracts";

import type {
  WhisperXAlignmentEvidence,
  WhisperXAlignmentRequest,
  WhisperXEvidenceContent,
} from "./types.js";

export function whisperXRequestForEvidenceAudio(
  basis: SpeechEvidenceAudio,
  options: { readonly language?: string } = {},
): WhisperXAlignmentRequest {
  assertSpeechEvidenceAudioIdentity(basis);
  return {
    contract: "svml.whisperx-alignment-request@2",
    audio: basis.artifact,
    sampleFrames: basis.sampleFrames,
    durationSec: basis.durationSec,
    segments: basis.segments,
    ...(options.language === undefined ? {} : { language: options.language }),
    wordAlignment: true,
    characterAlignment: "when-available",
  };
}

export function sealWhisperXAlignmentEvidence(
  content: WhisperXEvidenceContent,
): WhisperXAlignmentEvidence {
  return structuredClone(content);
}

export function normalizeWhisperXAlignment(
  evidence: WhisperXAlignmentEvidence,
): AlignedTranscriptEvidence {
  const {
    contract: _contract,
    ...shared
  } = evidence;
  return sealAlignedTranscriptEvidence({
    contract: "svml.aligned-transcript-evidence@1",
    ...shared,
  });
}
