import type { FrameSpan } from "@hypit/timeline";

/** Exact author duration. Decimal source spelling is reduced before reaching this value. */
export type TemporalDuration =
  | { readonly unit: "frames"; readonly value: number }
  | { readonly unit: "milliseconds"; readonly value: number }
  | { readonly unit: "seconds"; readonly numerator: number; readonly denominator: number };

/** An authored coordinate on the Timeline itself, before exact resolution. */
export type TemporalInstantExpression =
  | { readonly ref: "timeline.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "timeline.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "absolute"; readonly at: TemporalDuration; readonly offset?: TemporalDuration };

/** Exact author parameter that owns one projected endpoint. Syntax owners may omit it for references. */
export type TemporalAuthorParameter = {
  readonly binding: string;
  readonly relation: "direct" | "after-start" | "before-end";
};

/** Input value for an Instant projection producer. */
export type TemporalInstantSpec = {
  readonly id: string;
  /** Author/domain entity whose timing this projection controls. */
  readonly subjectId: string;
  readonly projection: TemporalInstantExpression;
  /** Optional inverse declared by the author syntax that created this Spec. */
  readonly author?: TemporalAuthorParameter;
};

/** Input value for composing two resolved Instants into a Window. */
export type TemporalWindowSpec = {
  readonly id: string;
  /** Author/domain entity whose timing this projection controls. */
  readonly subjectId: string;
};

/**
 * One exact temporal value. `ticks` is a decimal integer string so the wire
 * representation does not inherit JavaScript's safe-integer limit.
 */
export type ExactTemporalValue = {
  readonly ticks: string;
  readonly timeBase: { readonly numerator: number; readonly denominator: number };
};

/** The consumer-owned rule for resolving an exact boundary on a discrete Clock. */
export type TemporalBoundaryPolicy = "exact" | "cover" | "inside" | "nearest";

/** One unpositioned exact duration, independent of a Timeline or output Clock. */
export type TemporalExtent = {
  readonly duration: ExactTemporalValue;
};

/** Identity and direction for shifting one resolved Instant by an exact Extent. */
export type TemporalShiftSpec = {
  readonly id: string;
  readonly subjectId: string;
  readonly direction: 1 | -1;
  /** Defaults to `cover`, preserving the complete referenced Extent. */
  readonly resolution?: TemporalBoundaryPolicy;
  /** Optional duration inverse declared by the author syntax that created this shift. */
  readonly author?: TemporalAuthorParameter;
};

/**
 * One finite exact local coordinate system. A domain carries no media, sample
 * grid, semantic events or presentation role.
 */
export type LocalTemporalDomain = {
  readonly id: string;
  readonly duration: ExactTemporalValue;
};

export type TemporalRange = {
  readonly start: ExactTemporalValue;
  readonly end: ExactTemporalValue;
};

export type TemporalRate = {
  readonly numerator: number;
  readonly denominator: number;
};

/** One inward distance from a named edge of a finite local domain. */
export type TemporalRelativePoint = {
  readonly edge: "start" | "end";
  readonly offset: TemporalDuration;
};

export type TemporalRelativeRange = {
  readonly from: TemporalRelativePoint;
  readonly until: TemporalRelativePoint;
};

/**
 * Author syntax for constructing one local target-to-source relation. This is
 * not an independently addressable Map: its domains are supplied by the
 * occurrence which owns it.
 */
export type TemporalRelation =
  | {
      readonly kind: "rate";
      readonly target: TemporalRelativeRange;
      readonly targetAt: TemporalRelativePoint;
      readonly sourceAt: TemporalRelativePoint;
      readonly rate: TemporalRate;
      readonly source: TemporalRelativeRange;
      readonly wrap?: TemporalRelativeRange;
    }
  | {
      readonly kind: "fit";
      readonly target: TemporalRelativeRange;
      readonly source: TemporalRelativeRange;
    };

export type TemporalRelationSpec = {
  readonly relations: readonly TemporalRelation[];
};

/** One piece of a target-to-source temporal relation. Missing target ranges are gaps. */
export type TemporalMapPiece = {
  readonly target: TemporalRange;
  readonly sourceAtStart: ExactTemporalValue;
  /** Zero holds, a negative numerator reverses, and any other rational scales. */
  readonly rate: TemporalRate;
  /** Optional source interval used for looping this piece. */
  readonly wrap?: TemporalRange;
};

/** One independently meaningful relation between two named finite domains. */
export type TemporalMapStage = {
  readonly target: LocalTemporalDomain;
  readonly source: LocalTemporalDomain;
  readonly pieces: readonly TemporalMapPiece[];
};

/**
 * A composed target-to-source relation. Composition appends stages instead of
 * inventing a central registry or prematurely flattening piecewise relations.
 */
export type TemporalMap = {
  readonly stages: readonly TemporalMapStage[];
};

/** A resolved absolute coordinate. Its derivation remains in the author graph. */
export type TemporalInstant = {
  readonly id: string;
  readonly subjectId: string;
  readonly timelineId: string;
  readonly frame: number;
};

export type TemporalWindow = {
  readonly id: string;
  readonly subjectId: string;
  readonly start: TemporalInstant;
  readonly end: TemporalInstant;
  readonly span: FrameSpan;
};

export type WindowRelation = "independent" | "disjoint";

export type TriggerPoint = {
  readonly id: string;
  readonly frame: number;
};

export type TriggeredSchedule = {
  readonly outer: FrameSpan;
  readonly terminalFrame: number;
  readonly cumulative: readonly FrameSpan[];
  readonly exclusive: readonly FrameSpan[];
};
