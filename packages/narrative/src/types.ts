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
  /** The exact semantic anchors chosen by the author declaration's affinity syntax. */
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
  /** The exact semantic anchor chosen by the author declaration's affinity syntax. */
  readonly anchorId: string;
};

/** One explicitly authored semantic instant, independently referenceable by graph edges. */
export type NarrativeMomentRef = NarrativeMoment & {
  /** Author-visible `<script id>` that owns this independently exported Moment. */
  readonly narrativeId: string;
};

export type SemanticAnchor =
  | {
      readonly id: string;
      readonly kind: "segment-start" | "segment-end";
      readonly segmentId: string;
      readonly tokenId?: never;
    }
  | {
      readonly id: string;
      readonly kind: "token-start" | "token-end";
      readonly segmentId: string;
      readonly tokenId: string;
    };

/** Complete authored content; local views are projections of this value. */
export type Narrative = {
  /** Author-visible `<script id>`; every exported semantic view retains it. */
  readonly id: string;
  readonly segments: readonly NarrativeSegment[];
  readonly tokens: readonly NarrativeToken[];
  readonly turns: readonly NarrativeTurn[];
  readonly selections: readonly NarrativeSelection[];
  readonly moments: readonly NarrativeMoment[];
  readonly anchors: readonly SemanticAnchor[];
};

/**
 * One author-selected contiguous excerpt. Script is one possible producer;
 * generation and speech packages consume this shared value without importing
 * Script's parser or source representation.
 */
export type NarrativeSegmentRef = {
  readonly kind: "segment";
  /** Author-visible `<script id>` that owns this Segment. */
  readonly narrativeId: string;
  readonly id: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
};
