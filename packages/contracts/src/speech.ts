import type { Digest } from "@svml/protocol";

export type TimingQuality = "measured" | "derived" | "estimated";

export type ProgramSpace = {
  readonly contract: "svml.program-space@0";
  readonly digest: Digest;
  readonly durationSec: number;
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
};

export type MediaArtifactRef = {
  readonly digest: Digest;
  readonly size: number;
  readonly mediaType: string;
  readonly durationSec: number;
};

export type SpeechBasisSegment = {
  readonly segmentId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly sourceArtifactDigest: Digest;
};

export type SpeechBasis = {
  readonly contract: "svml.speech-basis@1";
  readonly basisDigest: Digest;
  readonly programSpace: ProgramSpace;
  readonly audio: MediaArtifactRef;
  readonly visualTrack: {
    readonly clips: readonly {
      readonly segmentId: string;
      readonly artifact: MediaArtifactRef;
      readonly startSec: number;
      readonly endSec: number;
    }[];
  };
  readonly segments: readonly SpeechBasisSegment[];
};

export type SpeechWordEvidence = {
  readonly text: string;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly score?: number;
};

export type SpeechCharacterEvidence = {
  readonly char: string;
  readonly wordIndex: number;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly score?: number;
};

export type SpeechActivitySpan = {
  readonly startSec: number;
  readonly endSec: number;
};

export type AlignedTranscriptSegment = {
  readonly sourceSegmentId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly words: readonly SpeechWordEvidence[];
  readonly chars: readonly SpeechCharacterEvidence[];
  readonly speechActivity?: readonly SpeechActivitySpan[];
};

export type AlignedTranscriptEvidence = {
  readonly contract: "svml.aligned-transcript-evidence@1";
  readonly basisDigest: Digest;
  readonly audioArtifactDigest: Digest;
  readonly programSpaceDigest: Digest;
  readonly rawEvidenceArtifactDigest: Digest;
  readonly evidenceDigest: Digest;
  readonly durationSec: number;
  readonly segments: readonly AlignedTranscriptSegment[];
};

export type AlignmentRelation =
  | "exact"
  | "split"
  | "merge"
  | "replacement"
  | "source-omission"
  | "evidence-insertion";

export type AlignmentGroup = {
  readonly sourceSegmentId: string;
  readonly sourceTokenIds: readonly string[];
  readonly evidenceWordStart: number;
  readonly evidenceWordEndExclusive: number;
  readonly relation: AlignmentRelation;
  readonly cost: number;
};

export type TimedSpeechToken = {
  readonly tokenId: string;
  readonly segmentId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
};

export type TimedSpeechSegment = {
  readonly segmentId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
};

export type SemanticTimePoint = {
  readonly identity: string;
  readonly timeSec: number;
  readonly frame: number;
  readonly quality: TimingQuality;
};

export type CompleteSemanticMap = {
  readonly contract: "svml.complete-semantic-map@1";
  readonly semanticIndexDigest: Digest;
  readonly basisDigest: Digest;
  readonly audioArtifactDigest: Digest;
  readonly programSpaceDigest: Digest;
  readonly evidenceDigest: Digest;
  readonly locatorDigest: Digest;
  readonly quantizationPolicy: "nearest-frame";
  readonly durationSec: number;
  readonly segments: readonly TimedSpeechSegment[];
  readonly tokens: readonly TimedSpeechToken[];
  readonly anchors: readonly SemanticTimePoint[];
  readonly groups: readonly AlignmentGroup[];
  readonly mapDigest: Digest;
};
