import type {
  AlignedTranscriptEvidence,
  AlignedTranscriptSegment,
  MediaArtifactRef,
  SpeechBasisSegment,
} from "@svml/contracts";
import type { Digest } from "@svml/protocol";

export type WhisperXAlignmentRequest = {
  readonly contract: "svml.whisperx-alignment-request@1";
  readonly basisDigest: Digest;
  readonly programSpaceDigest: Digest;
  readonly audio: MediaArtifactRef;
  readonly segments: readonly SpeechBasisSegment[];
  readonly language?: string;
  readonly wordAlignment: true;
  readonly characterAlignment: "when-available";
};

export type WhisperXAlignmentEvidence = {
  readonly contract: "svml.whisperx-alignment-evidence@1";
  readonly engine: "whisperx";
  readonly basisDigest: Digest;
  readonly audioArtifactDigest: Digest;
  readonly programSpaceDigest: Digest;
  readonly rawEvidenceArtifactDigest: Digest;
  readonly durationSec: number;
  readonly segments: readonly AlignedTranscriptSegment[];
  readonly alignmentDigest: Digest;
};

export type WhisperXEvidenceContent = Omit<WhisperXAlignmentEvidence, "alignmentDigest">;
export type ProviderNeutralEvidenceContent = Omit<AlignedTranscriptEvidence, "evidenceDigest">;
