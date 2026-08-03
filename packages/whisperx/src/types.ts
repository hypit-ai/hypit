export type TimingQuality = "measured" | "derived" | "estimated";

export type WhisperXWordEvidence = {
  readonly text: string;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly score?: number;
};

export type WhisperXCharEvidence = {
  readonly char: string;
  readonly wordIndex: number;
  readonly startSec?: number;
  readonly endSec?: number;
  readonly score?: number;
};

export type WhisperXVadSpan = {
  readonly startSec: number;
  readonly endSec: number;
};

/**
 * Normalized evidence from one ordinary WhisperX transcription + alignment run.
 * A host adapter keeps the raw provider result as an artifact and lowers the
 * fields used by this deterministic locator into this value.
 */
export type WhisperXSegmentEvidence = {
  readonly sourceSegmentId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly words: readonly WhisperXWordEvidence[];
  readonly chars: readonly WhisperXCharEvidence[];
  readonly vadSpans?: readonly WhisperXVadSpan[];
};

export type WhisperXEvidence = {
  readonly contract: "svml.whisperx-evidence@0";
  readonly durationSec: number;
  readonly segments: readonly WhisperXSegmentEvidence[];
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
  readonly contract: "svml.whisperx-speech-time-map@0";
  readonly semanticIndexDigest: string;
  readonly durationSec: number;
  readonly segments: readonly TimedSpeechSegment[];
  readonly tokens: readonly TimedSpeechToken[];
  readonly anchors: readonly SemanticTimePoint[];
  readonly groups: readonly AlignmentGroup[];
  readonly mapDigest: string;
};

export type TimedCaptionAtom = {
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly sourceTokenIds: readonly string[];
  readonly startSec: number;
  readonly endSec: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
};
