import type {
  AudioOperator,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
  TemporalControlBinding,
} from "@hypit/audiovisual";
import type { LocalSpatialDomain, SpatialMap, SpatialRegion } from "@hypit/spatial/algebra";
import type {
  ExactTemporalRelationSpec,
  ExactTemporalValue,
  TemporalRange,
} from "@hypit/temporal/algebra";

/** One author-local name bound by the Host to an already resolved multi-output Source. */
export type AudiovisualAuthorSource = {
  readonly binding: string;
};

/** A selected Source output with one occurrence-local, clock-free sampling relation. */
export type AudiovisualAuthorOccurrenceOutput = {
  readonly relation?: ExactTemporalRelationSpec;
  /** Author-local binding to a package-owned Signal reconstruction. */
  readonly reconstruction?: string;
};

/**
 * One authored use. Its stable local Domain and exact Maps are derived during linking.
 * Omitting duration means full-speed use from zero and requires all selected outputs
 * to have the same exact duration. Any authored relation requires an explicit finite
 * occurrence duration; it never creates another Source or PreparedMedia value.
 */
export type AudiovisualAuthorOccurrence = {
  readonly source: string;
  readonly at: ExactTemporalValue;
  readonly duration?: ExactTemporalValue;
  readonly outputs: Readonly<Record<string, AudiovisualAuthorOccurrenceOutput>>;
};

export type AudiovisualAuthorPictureExpression =
  | { readonly kind: "transparent" }
  | { readonly kind: "use"; readonly occurrence: string; readonly output: string }
  | { readonly kind: "reference"; readonly name: string }
  | {
      readonly kind: "restrict";
      readonly input: AudiovisualAuthorPictureExpression;
      readonly range: TemporalRange;
    }
  | {
      readonly kind: "crop";
      readonly input: AudiovisualAuthorPictureExpression;
      readonly region: SpatialRegion;
    }
  | {
      readonly kind: "remap";
      readonly input: AudiovisualAuthorPictureExpression;
      readonly mapping: SpatialMap;
    }
  | { readonly kind: "over"; readonly inputs: readonly AudiovisualAuthorPictureExpression[] }
  | {
      readonly kind: "apply";
      readonly operator: string;
      readonly inputs: Readonly<Record<string, AudiovisualAuthorPictureExpression>>;
      readonly controlBindings: Readonly<Record<string, TemporalControlBinding>>;
    };

export type AudiovisualAuthorAudioExpression =
  | { readonly kind: "silence" }
  | { readonly kind: "use"; readonly occurrence: string; readonly output: string }
  | { readonly kind: "reference"; readonly name: string }
  | {
      readonly kind: "restrict";
      readonly input: AudiovisualAuthorAudioExpression;
      readonly range: TemporalRange;
    }
  | { readonly kind: "mix"; readonly inputs: readonly AudiovisualAuthorAudioExpression[] }
  | {
      readonly kind: "apply";
      readonly operator: string;
      readonly inputs: Readonly<Record<string, AudiovisualAuthorAudioExpression>>;
      readonly controlBindings: Readonly<Record<string, TemporalControlBinding>>;
    };

export type AudiovisualAuthorPictureProgram = {
  /** Named reusable expressions. Declaration order has no meaning. */
  readonly bindings?: Readonly<Record<string, AudiovisualAuthorPictureExpression>>;
  readonly output: AudiovisualAuthorPictureExpression;
};

export type AudiovisualAuthorAudioProgram = {
  /** Named reusable expressions. Declaration order has no meaning. */
  readonly bindings?: Readonly<Record<string, AudiovisualAuthorAudioExpression>>;
  readonly output: AudiovisualAuthorAudioExpression;
};

/** Parser-independent author facts. It contains no syntax tree, Track, Clock or Renderer value. */
export type AudiovisualAuthorSpec = {
  readonly id: string;
  readonly duration: ExactTemporalValue;
  readonly pictureDomain?: LocalSpatialDomain;
  readonly sources: Readonly<Record<string, AudiovisualAuthorSource>>;
  readonly occurrences: Readonly<Record<string, AudiovisualAuthorOccurrence>>;
  readonly picture?: AudiovisualAuthorPictureProgram;
  readonly audio?: AudiovisualAuthorAudioProgram;
};

/** Host-owned resolved values available while one Author Spec is linked. */
export type AudiovisualAuthorBindings = {
  readonly sources: Readonly<Record<string, ProgramSource>>;
  readonly pictureOperators?: Readonly<Record<string, PictureOperator>>;
  readonly audioOperators?: Readonly<Record<string, AudioOperator>>;
  readonly reconstructions?: Readonly<Record<string, SignalReconstruction>>;
};

/** One author-local binding name attached to a future ProgramSource graph value. */
export type AudiovisualAuthorSourceBinding = {
  readonly name: string;
};

/** One author-local binding name attached to a package-owned typed Operator value. */
export type AudiovisualAuthorOperatorBinding = {
  readonly name: string;
};

export type AudiovisualAuthorReconstructionBinding = {
  readonly name: string;
};

/** Runtime fold of actual typed Source values, consumed only by the finite closer. */
export type AudiovisualAuthorBindingSet = AudiovisualAuthorBindings;
