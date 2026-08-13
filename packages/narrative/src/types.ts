export type NarrativeSegment = {
  readonly id: string;
  readonly startAnchorId: string;
  readonly endAnchorId: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
};

export type NarrativeToken = {
  readonly id: string;
  readonly segmentId: string;
  readonly startAnchorId: string;
  readonly endAnchorId: string;
  readonly text: string;
  readonly normalized: string;
};

export type NarrativeTurn = {
  readonly id: string;
  readonly segmentId: string;
  readonly role?: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
};

export type NarrativeSelectionOccurrence = {
  readonly occurrence: number;
  /** The exact semantic anchors chosen by the author Surface's affinity syntax. */
  readonly startAnchorId: string;
  readonly endAnchorId: string;
};

export type NarrativeSelection = {
  readonly id: string;
  readonly occurrences: readonly NarrativeSelectionOccurrence[];
};

/** One explicitly authored semantic window, independently referenceable by graph edges. */
export type NarrativeSelectionRef = NarrativeSelection & {
  readonly contract: "svml.narrative-selection@1";
};

export type NarrativeMomentOccurrence = {
  readonly occurrence: number;
  /** The exact semantic anchor chosen by the author Surface's affinity syntax. */
  readonly anchorId: string;
};

export type NarrativeMoment = {
  readonly id: string;
  readonly occurrences: readonly NarrativeMomentOccurrence[];
};

/** One explicitly authored semantic instant, independently referenceable by graph edges. */
export type NarrativeMomentRef = NarrativeMoment & {
  readonly contract: "svml.narrative-moment@1";
};

/** One author-visible word surface. Punctuation owned by the surface is preserved. */
export type CaptionDisplayWord = {
  readonly id: string;
  readonly atomId: string;
  readonly segmentId: string;
  readonly turnId: string;
  readonly role?: string;
  readonly text: string;
};

/** One indivisible Cue-planning unit. Fields may still address its ordered words. */
export type CaptionDisplayAtom = {
  readonly id: string;
  readonly segmentId: string;
  readonly turnId: string;
  readonly role?: string;
  readonly wordIds: readonly string[];
};

/** Complete visible Caption truth. It contains no pronunciation or timing facts. */
export type CaptionDisplaySequence = {
  readonly contract: "svml.caption-display-sequence@1";
  readonly id: string;
  readonly atoms: readonly CaptionDisplayAtom[];
  readonly words: readonly CaptionDisplayWord[];
};

/** Author-declared whole-Atom correspondence to spoken Script tokens; never an inferred refinement. */
export type CaptionCorrespondence = {
  readonly contract: "svml.caption-correspondence@1";
  readonly displaySequenceId: string;
  readonly atoms: readonly {
    readonly atomId: string;
    readonly sourceTokenIds: readonly string[];
  }[];
};

/** One ordered subset of an exact CaptionDisplaySequence, projected by Script structure. */
export type CaptionDisplayWordSubset = {
  readonly contract: "svml.caption-display-word-subset@1";
  readonly id: string;
  readonly sequenceId: string;
  readonly wordIds: readonly string[];
};

export type SemanticAnchor = {
  readonly id: string;
  readonly kind: "segment-start" | "token-start" | "token-end" | "segment-end";
  readonly segmentId: string;
  readonly tokenId?: string;
};

export type Narrative = {
  readonly contract: "svml.narrative@1";
  readonly segments: readonly NarrativeSegment[];
  readonly tokens: readonly NarrativeToken[];
  readonly turns: readonly NarrativeTurn[];
  readonly selections: readonly NarrativeSelection[];
  readonly moments: readonly NarrativeMoment[];
  readonly semanticIndex: {
    readonly contract: "svml.semantic-index@1";
    readonly anchors: readonly SemanticAnchor[];
  };
};

/**
 * One author-selected contiguous excerpt. Script is one possible producer;
 * generation and speech packages consume this shared value without importing
 * Script's parser or source representation.
 */
export type NarrativeExcerpt = {
  readonly contract: "svml.narrative-excerpt@1";
  readonly kind: "segment";
  readonly id: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
};
