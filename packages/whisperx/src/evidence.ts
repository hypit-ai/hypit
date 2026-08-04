import {
  assertSpeechAudioBasisIdentity,
  sealAlignedTranscriptEvidence,
} from "@svml/contracts";
import type { AlignedTranscriptEvidence, SpeechAudioBasis } from "@svml/contracts";
import { digestOf } from "@svml/core";

import type {
  WhisperXAlignmentEvidence,
  WhisperXAlignmentRequest,
  WhisperXEvidenceContent,
} from "./types.js";

export function whisperXRequestForAudioBasis(
  basis: SpeechAudioBasis,
  options: { readonly language?: string } = {},
): WhisperXAlignmentRequest {
  assertSpeechAudioBasisIdentity(basis);
  return {
    contract: "svml.whisperx-alignment-request@1",
    basisDigest: basis.basisDigest,
    programSpaceDigest: basis.programSpace.digest,
    audio: basis.audio,
    segments: basis.segments,
    ...(options.language === undefined ? {} : { language: options.language }),
    wordAlignment: true,
    characterAlignment: "when-available",
  };
}

export function sealWhisperXAlignmentEvidence(
  content: WhisperXEvidenceContent,
): WhisperXAlignmentEvidence {
  return { ...content, alignmentDigest: digestOf(content) };
}

export function normalizeWhisperXAlignment(
  evidence: WhisperXAlignmentEvidence,
): AlignedTranscriptEvidence {
  const { alignmentDigest, ...content } = evidence;
  if (alignmentDigest !== digestOf(content)) {
    throw new Error("WhisperX alignment digest does not match its canonical contents.");
  }
  const { alignmentDigest: _alignmentDigest, engine: _engine, contract: _contract, ...shared } = evidence;
  return sealAlignedTranscriptEvidence({
    contract: "svml.aligned-transcript-evidence@1",
    ...shared,
  });
}
