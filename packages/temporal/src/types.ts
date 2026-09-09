export type FramePoint = {
  readonly frame: number;
};

export type LocatedSelection = {
  readonly id: string;
  readonly start: FramePoint;
  readonly end: FramePoint;
};

export type LocatedMoment = {
  readonly id: string;
  readonly cue: FramePoint;
};

export type LocatedProgram = {
  readonly id: "program";
  readonly start: FramePoint;
  readonly end: FramePoint;
};

export type LocatedSegment = {
  readonly id: string;
  readonly start: FramePoint;
  readonly end: FramePoint;
};

/** Exact author duration. Decimal source spelling is reduced before reaching this value. */
export type TemporalDuration =
  | { readonly unit: "frames"; readonly value: number }
  | { readonly unit: "milliseconds"; readonly value: number }
  | { readonly unit: "seconds"; readonly numerator: number; readonly denominator: number };

/** A single projected boundary before it is resolved into ProgramSpace. */
export type TemporalInstantExpression =
  | { readonly ref: "program.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "program.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "selection.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "selection.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "segment.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "segment.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "moment.cue"; readonly offset?: TemporalDuration }
  | { readonly ref: "absolute"; readonly at: TemporalDuration; readonly offset?: TemporalDuration };

/** Runtime dependency used to resolve an Instant. This is not its authoring authority. */
export type TemporalSource = {
  readonly spaceId: string;
  /** Present when the boundary originates in a Script. */
  readonly narrativeId?: string;
  readonly kind: "program" | "selection" | "segment" | "moment";
  readonly id: string;
};

/**
 * The author-owned inverse of one projected Instant. Runtime dependencies and
 * author authority are deliberately separate: an expression may read an
 * anchor while remaining writable only at its author parameter.
 */
export type TemporalInstantAuthority =
  | { readonly kind: "semantic"; readonly boundary: "start" | "end" | "cue" }
  | {
      readonly kind: "parameter";
      readonly binding: string;
      readonly relation: "direct" | "after-start" | "before-end";
    }
  | { readonly kind: "fixed" };

/** Input value for an Instant projection producer. */
export type TemporalInstantSpec = {
  readonly id: string;
  /** Author/domain entity whose timing this projection controls. */
  readonly subjectId: string;
  readonly projection: TemporalInstantExpression;
  readonly authority: TemporalInstantAuthority;
};

/** Input value for composing two resolved Instants into a Window. */
export type TemporalWindowSpec = {
  readonly id: string;
  /** Author/domain entity whose timing this projection controls. */
  readonly subjectId: string;
};

export type FrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type ProjectedInstant = {
  readonly id: string;
  readonly subjectId: string;
  readonly source: TemporalSource;
  readonly projection: TemporalInstantExpression;
  readonly authority: TemporalInstantAuthority;
  readonly frame: number;
};

export type ProjectedWindow = {
  readonly id: string;
  readonly subjectId: string;
  readonly start: ProjectedInstant;
  readonly end: ProjectedInstant;
  readonly span: FrameSpan;
};

/** Public projection protocol consumed by domain programs. */
export type TemporalInstant = ProjectedInstant;

/** Public projection protocol composed from two independently traced Instants. */
export type TemporalWindow = ProjectedWindow;

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
