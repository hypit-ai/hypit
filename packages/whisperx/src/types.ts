import type {
  AlignedTranscriptEvidence,
  AlignedTranscriptSegment,
  SpeechEvidenceAudio,
  SpeechBasisSegment,
} from "@svml/contracts";
import type { Digest } from "@svml/protocol";

export type WhisperXAlignmentRequest = {
  readonly contract: "svml.whisperx-alignment-request@2";
  readonly programSpaceDigest: Digest;
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
  readonly engine: "whisperx";
  /** Exact acoustic Artifact measured by WhisperX. */
  readonly audioArtifactDigest: Digest;
  readonly programSpaceDigest: Digest;
  readonly durationSec: number;
  readonly segments: readonly AlignedTranscriptSegment[];
  readonly alignmentDigest: Digest;
};

export type WhisperXEvidenceContent = Omit<WhisperXAlignmentEvidence, "alignmentDigest">;
export type ProviderNeutralEvidenceContent = Omit<AlignedTranscriptEvidence, "evidenceDigest">;
