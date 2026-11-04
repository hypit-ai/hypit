/** One exact temporal value on a rational time base. */
export type ExactTemporalValue = {
  readonly ticks: string;
  readonly timeBase: { readonly numerator: number; readonly denominator: number };
};

/** One finite exact local coordinate system with no sampling grid. */
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

/** One inward exact distance from an edge of a finite local domain. */
export type ExactTemporalRelativePoint = {
  readonly edge: "start" | "end";
  readonly offset: ExactTemporalValue;
};

export type ExactTemporalRelativeRange = {
  readonly from: ExactTemporalRelativePoint;
  readonly until: ExactTemporalRelativePoint;
};

/** Clock-free occurrence-local relation syntax, resolved only after both finite domains exist. */
export type ExactTemporalRelation =
  | {
      readonly kind: "rate";
      readonly target: ExactTemporalRelativeRange;
      readonly targetAt: ExactTemporalRelativePoint;
      readonly sourceAt: ExactTemporalRelativePoint;
      readonly rate: TemporalRate;
      readonly source: ExactTemporalRelativeRange;
      readonly wrap?: ExactTemporalRelativeRange;
    }
  | {
      readonly kind: "fit";
      readonly target: ExactTemporalRelativeRange;
      readonly source: ExactTemporalRelativeRange;
    }
  | {
      readonly kind: "cubic";
      readonly target: ExactTemporalRelativeRange;
      readonly sourceAtStart: ExactTemporalRelativePoint;
      readonly sourceControl1: ExactTemporalRelativePoint;
      readonly sourceControl2: ExactTemporalRelativePoint;
      readonly sourceAtEnd: ExactTemporalRelativePoint;
    };

export type ExactTemporalRelationSpec = {
  readonly relations: readonly ExactTemporalRelation[];
};

/** One exact affine piece. Missing target ranges are gaps. */
export type TemporalAffineMapPiece = {
  readonly target: TemporalRange;
  readonly sourceAtStart: ExactTemporalValue;
  readonly rate: TemporalRate;
  readonly wrap?: TemporalRange;
};

/** One exact cubic source-position piece over a linearly parameterized target range. */
export type TemporalCubicMapPiece = {
  readonly target: TemporalRange;
  readonly sourceAtStart: ExactTemporalValue;
  readonly sourceControl1: ExactTemporalValue;
  readonly sourceControl2: ExactTemporalValue;
  readonly sourceAtEnd: ExactTemporalValue;
};

export type TemporalMapPiece = TemporalAffineMapPiece | TemporalCubicMapPiece;

export type TemporalMapStage = {
  readonly target: LocalTemporalDomain;
  readonly source: LocalTemporalDomain;
  readonly pieces: readonly TemporalMapPiece[];
};

/** A composed target-to-source relation. */
export type TemporalMap = {
  readonly stages: readonly TemporalMapStage[];
};
