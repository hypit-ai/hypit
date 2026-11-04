/** The discrete sampling clock shared by one authored Timeline and its material. */
export type Clock = {
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
};

/** One complete, content-independent absolute frame domain. */
export type Timeline = Clock & {
  /** Author-visible identity of this film time axis. */
  readonly id: string;
  /** Boundary after the final rendered frame. */
  readonly frameCount: number;
};

/** A half-open interval on one finite frame domain. */
export type FrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

/** One resolved absolute boundary on a finite Timeline. */
export type TemporalInstant = {
  readonly id: string;
  readonly subjectId: string;
  readonly timelineId: string;
  readonly frame: number;
};

/** One resolved non-empty half-open interval on a finite Timeline. */
export type TemporalWindow = {
  readonly id: string;
  readonly subjectId: string;
  readonly start: TemporalInstant;
  readonly end: TemporalInstant;
  readonly span: FrameSpan;
};

/** Stable identity supplied when a graph composes resolved temporal values. */
export type TemporalIdentitySpec = {
  readonly id: string;
  readonly subjectId: string;
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
