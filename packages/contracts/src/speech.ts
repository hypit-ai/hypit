import type { BlobRef, Digest } from "@svml/protocol";

export type TimingQuality = "measured" | "derived" | "estimated";

/**
 * One planned duration for one exact Narrative speech excerpt.
 *
 * The value is intentionally provider-neutral: a deterministic estimator,
 * an authored constant or another realization may produce it. Consumers such
 * as Seedance decide which numeric subset they accept.
 */
export type SpeechDuration = {
  readonly contract: "svml.speech-duration@1";
  readonly segmentId: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
  readonly sourceSpeechExcerptDigest: Digest;
  readonly durationSec: number;
  readonly durationDigest: Digest;
};

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

/** Deterministic audio projection of one atomic SpeechBasis/SpeechTake Product. */
export type SpeechAudioBasis = {
  readonly contract: "svml.speech-audio-basis@1";
  readonly programSpace: ProgramSpace;
  readonly audio: MediaArtifactRef;
  readonly segments: readonly SpeechBasisSegment[];
};

/** Canonical 16 kHz mono PCM projection used only for acoustic alignment evidence. */
export type SpeechEvidenceAudio = {
  readonly contract: "svml.speech-evidence-audio@1";
  readonly programSpaceDigest: Digest;
  /** The 48 kHz speech-master bytes from which this projection was derived. */
  readonly sourceAudioArtifactDigest: Digest;
  readonly artifact: BlobRef;
  readonly codec: "pcm_s16le";
  readonly sampleRate: 16_000;
  readonly channels: 1;
  readonly sampleFrames: number;
  readonly durationSec: number;
  readonly segments: readonly SpeechBasisSegment[];
  readonly sampleMap: {
    readonly algorithm: "rational-boundary-round@1";
    readonly sourceSampleRate: 48_000;
    readonly evidenceSampleRate: 16_000;
    readonly sourceSampleFrames: number;
    readonly evidenceSampleFrames: number;
    readonly sourceOriginSample: 0;
    readonly evidenceOriginSample: 0;
    readonly resamplerImplementation: string;
  };
  readonly evidenceAudioDigest: Digest;
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
  /** Exact acoustic Artifact measured by the recognizer. */
  readonly audioArtifactDigest: Digest;
  readonly programSpaceDigest: Digest;
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
  readonly programSpace: ProgramSpace;
  readonly quantizationPolicy: "nearest-frame";
  readonly durationSec: number;
  readonly segments: readonly TimedSpeechSegment[];
  readonly tokens: readonly TimedSpeechToken[];
  readonly anchors: readonly SemanticTimePoint[];
  readonly groups: readonly AlignmentGroup[];
  readonly mapDigest: Digest;
};
