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

export type NarrativeSelection = {
  readonly id: string;
  /** The exact semantic anchors chosen by the author Surface's affinity syntax. */
  readonly startAnchorId: string;
  readonly endAnchorId: string;
};

/** One explicitly authored semantic window, independently referenceable by graph edges. */
export type NarrativeSelectionRef = NarrativeSelection & {
  /** Author-visible `<script id>` that owns this independently exported Selection. */
  readonly narrativeId: string;
};

export type NarrativeMoment = {
  readonly id: string;
  /** The exact semantic anchor chosen by the author Surface's affinity syntax. */
  readonly anchorId: string;
};

/** One explicitly authored semantic instant, independently referenceable by graph edges. */
export type NarrativeMomentRef = NarrativeMoment & {
  /** Author-visible `<script id>` that owns this independently exported Moment. */
  readonly narrativeId: string;
};

/** One author-visible word surface. Punctuation owned by the surface is preserved. */
export type CaptionDisplayWord = {
  readonly id: string;
  readonly unitId: string;
  readonly segmentId: string;
  readonly turnId: string;
  readonly role?: string;
  readonly text: string;
  /** Reserved for Script-native word attributes; empty until an inline Mark is authored. */
  readonly attributes: readonly CaptionWordAttribute[];
};

export type CaptionWordAttributeValue = string | number | boolean;

export type CaptionWordAttribute = {
  readonly name: string;
  readonly value: CaptionWordAttributeValue;
};

/** The smallest author-declared N:M display-to-speech correspondence unit. */
export type CaptionAlignmentUnit = {
  readonly id: string;
  readonly segmentId: string;
  readonly turnId: string;
  readonly role?: string;
  readonly wordIds: readonly string[];
  /** Speech tokens are retained here so Caption can project a Narrative Selection without frames. */
  readonly sourceTokenIds: readonly string[];
};

export type CaptionCueBreak = {
  /** The Cue boundary is after this complete Alignment Unit. */
  readonly afterUnitId: string;
};

/** Complete Script-owned Caption truth. It contains no frame or measured timing facts. */
export type CaptionDocument = {
  /** Author-visible `<script id>` that owns this caption projection. */
  readonly narrativeId: string;
  readonly id: string;
  readonly units: readonly CaptionAlignmentUnit[];
  readonly words: readonly CaptionDisplayWord[];
  readonly cueBreaks: readonly CaptionCueBreak[];
};

export type SemanticAnchor =
  | {
      readonly id: "program:start";
      readonly kind: "program-start";
      readonly segmentId?: never;
      readonly tokenId?: never;
    }
  | {
      readonly id: "program:end";
      readonly kind: "program-end";
      readonly segmentId?: never;
      readonly tokenId?: never;
    }
  | {
      readonly id: string;
      readonly kind: "segment-start" | "token-start" | "token-end" | "segment-end";
      readonly segmentId: string;
      readonly tokenId?: string;
    };

export type Narrative = {
  /** Author-visible `<script id>`; every exported semantic view retains it. */
  readonly id: string;
  readonly segments: readonly NarrativeSegment[];
  readonly tokens: readonly NarrativeToken[];
  readonly turns: readonly NarrativeTurn[];
  readonly selections: readonly NarrativeSelection[];
  readonly moments: readonly NarrativeMoment[];
  readonly semanticIndex: {
    readonly anchors: readonly SemanticAnchor[];
  };
};

/**
 * One author-selected contiguous excerpt. Script is one possible producer;
 * generation and speech packages consume this shared value without importing
 * Script's parser or source representation.
 */
export type NarrativeExcerpt = {
  readonly kind: "segment";
  /** Author-visible `<script id>` that owns this Segment. */
  readonly narrativeId: string;
  readonly id: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
};
