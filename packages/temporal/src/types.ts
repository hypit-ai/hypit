import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalRate,
} from "./algebra-types.js";
import type { TemporalDuration } from "./sampling.js";

export type * from "./algebra-types.js";
export type * from "./sampling.js";

/** One unpositioned exact duration, independent of a Timeline or output Clock. */
export type TemporalExtent = {
  readonly duration: ExactTemporalValue;
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
    }
  | {
      /** Cubic source position over a linearly parameterized target range. */
      readonly kind: "cubic";
      readonly target: TemporalRelativeRange;
      readonly sourceAtStart: TemporalRelativePoint;
      readonly sourceControl1: TemporalRelativePoint;
      readonly sourceControl2: TemporalRelativePoint;
      readonly sourceAtEnd: TemporalRelativePoint;
    };

export type TemporalRelationSpec = {
  readonly relations: readonly TemporalRelation[];
};
