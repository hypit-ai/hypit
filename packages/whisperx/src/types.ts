import type { SpeechBasisSegment, SpeechEvidenceAudio } from "@narratage/speech";
import type { AlignedTranscriptEvidence, AlignedTranscriptSegment } from "@narratage/speech-evidence";

export type WhisperXAlignmentRequest = {
  readonly contract: "svml.whisperx-alignment-request@1";
  readonly audio: SpeechEvidenceAudio["artifact"];
  readonly sampleFrames: number;
  readonly durationSec: number;
  readonly segments: readonly SpeechBasisSegment[];
  readonly language?: string;
  readonly wordAlignment: true;
  readonly characterAlignment: "when-available";
};

export type WhisperXAlignmentEvidence = {
  readonly contract: "svml.whisperx-alignment-evidence@1";
  readonly durationSec: number;
  readonly segments: readonly AlignedTranscriptSegment[];
};

export type WhisperXEvidenceContent = WhisperXAlignmentEvidence;
export type ProviderNeutralEvidenceContent = AlignedTranscriptEvidence;
