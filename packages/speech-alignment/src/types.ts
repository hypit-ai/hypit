export type {
  AlignedTranscriptEvidence,
  SpeechActivitySpan,
  SpeechCharacterEvidence,
  SpeechTranscriptPassage,
  SpeechWordEvidence,
} from "@hypit/speech-evidence";
/** Private vocabulary of the alignment implementation, not part of SemanticMap. */
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

export type TimedSpeechSegment = {
  readonly segmentId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};
