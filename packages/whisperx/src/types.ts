import type {
  AlignedTranscriptEvidence,
  AlignedTranscriptSegment,
  SpeechEvidenceAudio,
  SpeechBasisSegment,
} from "@svml/contracts";

export type WhisperXAlignmentRequest = {
  readonly contract: "svml.whisperx-alignment-request@2";
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly durationSec: number;
  readonly segments: readonly SpeechBasisSegment[];
  readonly language?: string;
  readonly wordAlignment: true;
  readonly characterAlignment: "when-available";
};

export type WhisperXAlignmentEvidence = {
  readonly contract: "svml.whisperx-alignment-evidence@2";
  readonly durationSec: number;
  readonly segments: readonly AlignedTranscriptSegment[];
};

export type WhisperXEvidenceContent = WhisperXAlignmentEvidence;
export type ProviderNeutralEvidenceContent = AlignedTranscriptEvidence;
