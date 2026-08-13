export type FramePoint = {
  readonly frame: number;
};

export type LocatedSelectionOccurrence = {
  readonly id: string;
  readonly occurrence: number;
  readonly start: FramePoint;
  readonly end: FramePoint;
};

export type LocatedMomentOccurrence = {
  readonly id: string;
  readonly occurrence: number;
  readonly cue: FramePoint;
};

export type LocatedProgramOccurrence = {
  readonly id: "program";
  readonly start: FramePoint;
  readonly end: FramePoint;
};

export type LocatedSegmentOccurrence = {
  readonly id: string;
  readonly start: FramePoint;
  readonly end: FramePoint;
};

/** Exact author duration. Decimal source spelling is reduced before reaching this value. */
export type TemporalDuration =
  | { readonly unit: "frames"; readonly value: number }
  | { readonly unit: "milliseconds"; readonly value: number }
  | { readonly unit: "seconds"; readonly numerator: number; readonly denominator: number };

export type TemporalPointExpression =
  | { readonly ref: "program.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "program.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "selection.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "selection.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "segment.start"; readonly offset?: TemporalDuration }
  | { readonly ref: "segment.end"; readonly offset?: TemporalDuration }
  | { readonly ref: "moment.cue"; readonly offset?: TemporalDuration }
  | { readonly ref: "absolute"; readonly at: TemporalDuration };

export type TemporalWindowProjection = {
  readonly start: TemporalPointExpression;
  readonly end: TemporalPointExpression;
};

export type OccurrenceExpansion =
  | { readonly kind: "one" }
  | { readonly kind: "each" };

export type FrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type ProjectedOccurrence = {
  readonly id: string;
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
