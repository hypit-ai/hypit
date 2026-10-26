export type {
  SpeechTranscriptEvidence,
  SpeechActivitySpan,
  SpeechCharacterEvidence,
  SpeechTranscriptPassage,
  SpeechWordEvidence,
} from "@hypit/speech-evidence";
/** Private vocabulary of the alignment implementation, not part of the public alignment value. */
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
  readonly startUnit: number;
  readonly endUnitExclusive: number;
};

/** Private provider measurement resolved before publishing NarrativeAlignment. */
export type NarrativeAlignmentTiming = {
  readonly timeBase: { readonly numerator: number; readonly denominator: number };
  readonly tokens: readonly {
    readonly tokenId: string;
    readonly segmentId: string;
    readonly startUnit: number;
    readonly endUnitExclusive: number;
  }[];
  readonly boundaries: readonly { readonly id: string; readonly unit: number }[];
};
