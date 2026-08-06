import type {
  AlignedTranscriptEvidence,
  AlignedTranscriptSegment,
  SpeechEvidenceAudio,
  SpeechBasisSegment,
} from "@svml/contracts";
import type { Digest } from "@svml/protocol";

export type WhisperXAlignmentRequest = {
  readonly contract: "svml.whisperx-alignment-request@2";
  readonly basisDigest: Digest;
  readonly narrativeDigest: Digest;
  readonly programSpaceDigest: Digest;
  readonly sourceAudioArtifactDigest: Digest;
  readonly evidenceAudioDigest: Digest;
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
  readonly basisDigest: Digest;
  readonly audioArtifactDigest: Digest;
  readonly evidenceAudioDigest: Digest;
  readonly programSpaceDigest: Digest;
  readonly rawEvidenceArtifactDigest: Digest;
  readonly durationSec: number;
  readonly segments: readonly AlignedTranscriptSegment[];
  readonly alignmentDigest: Digest;
};

export type WhisperXEvidenceContent = Omit<WhisperXAlignmentEvidence, "alignmentDigest">;
export type ProviderNeutralEvidenceContent = Omit<AlignedTranscriptEvidence, "evidenceDigest">;
