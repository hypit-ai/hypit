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

/** Authored semantic source used by a temporal projection. */
export type TemporalSource = {
  readonly kind: "program" | "selection" | "segment" | "moment";
  readonly id: string;
};

/** Input value for the Temporal projection producer. */
export type TemporalWindowSpec = {
  readonly id: string;
  readonly projection: TemporalWindowProjection;
};

/** Input value for a Temporal point projection producer. */
export type TemporalPointSpec = {
  readonly id: string;
  readonly projection: TemporalPointExpression;
};

export type FrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type ProjectedWindow = {
  readonly id: string;
  readonly source: TemporalSource;
  readonly projection: TemporalWindowProjection;
  readonly span: FrameSpan;
};

export type ProjectedPoint = {
  readonly id: string;
  readonly source: TemporalSource;
  readonly projection: TemporalPointExpression;
  readonly frame: number;
};

/** Public protocol name for the resolved window consumed by domain programs. */
export type TemporalWindow = ProjectedWindow;

/** Public protocol name for the resolved boundary consumed by domain programs. */
export type TemporalPoint = ProjectedPoint;

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
