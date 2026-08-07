export type Affinity = "left" | "right";

export type MarkerBoundary = {
  readonly tokenIndex: number;
  readonly structuralPosition: number;
  readonly segmentId?: string;
};

export type NarrativeSegment = {
  readonly id: string;
  readonly index: number;
  readonly startAnchorId: string;
  readonly endAnchorId: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
};

export type NarrativeToken = {
  readonly id: string;
  readonly index: number;
  readonly segmentId: string;
  readonly segmentTokenIndex: number;
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
  readonly open: { readonly affinity: Affinity; readonly boundary: MarkerBoundary };
  readonly close: { readonly affinity: Affinity; readonly boundary: MarkerBoundary };
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
  readonly affinity: Affinity;
  readonly boundary: MarkerBoundary;
};

export type NarrativeMoment = {
  readonly id: string;
  readonly occurrences: readonly NarrativeMomentOccurrence[];
};

export type CaptionRefinement = {
  readonly id: string;
  readonly display: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly startToken: number;
  readonly endTokenExclusive: number;
  readonly relation: "exact";
};

export type CaptionRegion = {
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly startToken: number;
  readonly endTokenExclusive: number;
  readonly kind: "identity" | "alias" | "hidden";
  readonly refinements: readonly CaptionRefinement[];
};

export type CaptionProjection = {
  readonly contract: "svml.caption-projection@0";
  readonly text: string;
  readonly regions: readonly CaptionRegion[];
};

/** Whole authored display projection. It contains no pronunciation replacement text. */
export type CaptionProjectionRef = CaptionProjection;

export type SemanticAnchor = {
  readonly id: string;
  readonly kind: "segment-start" | "token-start" | "token-end" | "segment-end";
  readonly segmentId: string;
  readonly tokenId?: string;
  readonly segmentTokenIndex?: number;
};

export type Narrative = {
  readonly contract: "svml.narrative@0";
  readonly segments: readonly NarrativeSegment[];
  readonly tokens: readonly NarrativeToken[];
  readonly turns: readonly NarrativeTurn[];
  readonly selections: readonly NarrativeSelection[];
  readonly moments: readonly NarrativeMoment[];
  readonly captionProjection: CaptionProjection;
  readonly semanticIndex: {
    readonly contract: "svml.semantic-index@0";
    readonly anchors: readonly SemanticAnchor[];
  };
  readonly serializations: {
    readonly dialogue: string;
    readonly speech: string;
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
  readonly serializations: {
    readonly dialogue: string;
    readonly speech: string;
  };
};

/** The exact dialogue prompt for one Segment, including only explicitly authored Role prefixes. */
export type NarrativeDialogueExcerpt = {
  readonly contract: "svml.narrative-dialogue-excerpt@1";
  readonly kind: "segment";
  readonly id: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
  readonly dialogue: string;
};

/** The exact spoken wording for one Segment, without Role prefixes. */
export type NarrativeSpeechExcerpt = {
  readonly contract: "svml.narrative-speech-excerpt@1";
  readonly kind: "segment";
  readonly id: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
  readonly speech: string;
};
