/** Clock-free temporal algebra. This is a Temporal package boundary, not the Hypit Core. */
export * from "./domain.js";
export * from "./exact.js";
export * from "./map.js";
export * from "./exact-relation.js";
export * from "./rate-profile.js";
export type { Rational } from "./rational.js";
export type {
  ExactTemporalValue,
  ExactTemporalRelation,
  ExactTemporalRelationSpec,
  ExactTemporalRelativePoint,
  ExactTemporalRelativeRange,
  LocalTemporalDomain,
  TemporalAffineMapPiece,
  TemporalCubicMapPiece,
  TemporalMap,
  TemporalMapPiece,
  TemporalMapStage,
  TemporalRange,
  TemporalRate,
} from "./algebra-types.js";
