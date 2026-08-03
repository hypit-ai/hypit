export type TimingQuality = "measured" | "derived" | "estimated";

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

/**
 * Provider-neutral evidence produced by a speech-recognition adapter. The
 * adapter keeps its raw provider result as an artifact and lowers only the
 * fields used by this deterministic locator into this value.
 */
export type AlignedTranscriptSegment = {
  readonly sourceSegmentId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly words: readonly SpeechWordEvidence[];
  readonly chars: readonly SpeechCharacterEvidence[];
  readonly speechActivity?: readonly SpeechActivitySpan[];
};

export type AlignedTranscriptEvidence = {
  readonly contract: "svml.aligned-transcript-evidence@0";
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
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
};

export type TimedSpeechSegment = {
  readonly segmentId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
};

export type SemanticTimePoint = {
  readonly identity: string;
  readonly timeSec: number;
  readonly quality: TimingQuality;
};

export type CompleteSpeechTimeMap = {
  readonly contract: "svml.speech-time-map@0";
  readonly semanticIndexDigest: string;
  readonly durationSec: number;
  readonly segments: readonly TimedSpeechSegment[];
  readonly tokens: readonly TimedSpeechToken[];
  readonly anchors: readonly SemanticTimePoint[];
  readonly groups: readonly AlignmentGroup[];
  readonly mapDigest: string;
};
