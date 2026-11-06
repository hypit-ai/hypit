import type {
  AudioOperator,
  Occurrence,
  OccurrenceOutputSelection,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "@hypit/audiovisual";
import type { LocalSpatialDomain, SpatialMap, SpatialRegion } from "@hypit/spatial/algebra";
import type { CanonicalValue } from "@hypit/protocol";
import type {
  ExactTemporalRelationSpec,
  ExactTemporalValue,
  TemporalMap,
  TemporalMapRegionSet,
  TemporalRange,
} from "@hypit/temporal/algebra";

/** A factual value may be present now or supplied by any typed graph result later. */
export type AudiovisualAuthorValue<Value> = Value | {
  readonly kind: "binding";
  readonly name: string;
};

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
  readonly at?: AudiovisualAuthorValue<ExactTemporalValue>;
  readonly duration?: AudiovisualAuthorValue<ExactTemporalValue>;
  readonly time?:
    | { readonly kind: "source"; readonly occurrence: string; readonly output: string }
    | { readonly kind: "occurrence"; readonly occurrence: string }
    | {
        readonly kind: "event";
        readonly occurrence: string;
        readonly output: string;
        readonly event: AudiovisualAuthorValue<TemporalMapRegionSet>;
        readonly offset?: AudiovisualAuthorValue<ExactTemporalValue>;
        readonly require: "unique";
      };
  readonly outputs: Readonly<Record<string, AudiovisualAuthorOccurrenceOutput>>;
};

/**
 * Static package-owned facts required to resolve one occurrence use. Values that
 * may arrive from the AuthorGraph (Source, start and duration) remain typed ports
 * rather than being hidden inside this Record.
 */
export type AudiovisualAuthorOccurrenceUseSpec = {
  readonly id: string;
  readonly domainId: string;
  readonly outputs: Readonly<Record<string, AudiovisualAuthorOccurrenceOutput>>;
};

/**
 * One complete author-side Source use before a Programme Domain exists.
 * This is not a partial AVIR Occurrence: its local Domain and every selected
 * output Mapping are already factual. Closing only attaches and validates the
 * finite parent Domain.
 */
export type AudiovisualAuthorOccurrenceUse = {
  readonly id: string;
  readonly source: ProgramSource;
  readonly domain: import("@hypit/temporal/algebra").LocalTemporalDomain;
  readonly start: ExactTemporalValue;
  readonly active: TemporalRange;
  readonly selections: Readonly<Record<string, OccurrenceOutputSelection>>;
};

export type AudiovisualAuthorSourceBoundSpec = {
  readonly id: string;
  readonly targetOutput: string;
  readonly outputs: readonly string[];
};

export type AudiovisualAuthorOccurrenceBoundSpec = {
  readonly id: string;
  readonly outputs: readonly string[];
};

export type AudiovisualAuthorOccurrenceOutputSpec = {
  readonly output: string;
};

export type AudiovisualAuthorProgramDomainSpec = {
  readonly id: string;
};

/** Homogeneous collection of already closed AVIR Occurrences. */
export type AudiovisualAuthorOccurrenceSet = Readonly<Record<string, Occurrence>>;

/**
 * Author-owned choice of the time relation used by one package-owned Control.
 * Local names are resolved only while the Programme closes. A relation is
 * resolved from the Programme domain into the Operator's declared Control
 * domain; an already factual Map may also arrive through any typed graph value.
 */
export type AudiovisualAuthorControlBinding =
  | { readonly kind: "program" }
  | { readonly kind: "occurrence"; readonly occurrence: string }
  | { readonly kind: "source"; readonly occurrence: string; readonly output: string }
  | { readonly kind: "relation"; readonly relation: ExactTemporalRelationSpec }
  | { readonly kind: "mapping"; readonly mapping: AudiovisualAuthorValue<TemporalMap> };

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
      readonly mapping: AudiovisualAuthorValue<SpatialMap>;
    }
  | { readonly kind: "over"; readonly inputs: readonly AudiovisualAuthorPictureExpression[] }
  | {
      readonly kind: "apply";
      readonly operator: string;
      readonly inputs: Readonly<Record<string, AudiovisualAuthorPictureExpression>>;
      readonly controlBindings: Readonly<Record<string, AudiovisualAuthorControlBinding>>;
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
      readonly controlBindings: Readonly<Record<string, AudiovisualAuthorControlBinding>>;
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
  readonly duration: AudiovisualAuthorValue<ExactTemporalValue>;
  readonly pictureDomain?: AudiovisualAuthorValue<LocalSpatialDomain>;
  readonly sources: Readonly<Record<string, AudiovisualAuthorSource>>;
  readonly occurrences: Readonly<Record<string, AudiovisualAuthorOccurrence>>;
  readonly picture?: AudiovisualAuthorPictureProgram;
  readonly audio?: AudiovisualAuthorAudioProgram;
};

/** Host-owned resolved values available while one Author Spec is linked. */
export type AudiovisualAuthorBindings = {
  readonly values?: Readonly<Record<string, CanonicalValue>>;
  readonly sources: Readonly<Record<string, ProgramSource>>;
  readonly pictureOperators?: Readonly<Record<string, PictureOperator>>;
  readonly audioOperators?: Readonly<Record<string, AudioOperator>>;
  readonly reconstructions?: Readonly<Record<string, SignalReconstruction>>;
};

/** One author-local binding name attached to a package-owned typed Operator value. */
export type AudiovisualAuthorOperatorBinding = {
  readonly name: string;
};

export type AudiovisualAuthorReconstructionBinding = {
  readonly name: string;
};

export type AudiovisualAuthorValueBinding = {
  readonly name: string;
};

/** Runtime fold of actual typed Source values, consumed only by the finite closer. */
export type AudiovisualAuthorBindingSet = AudiovisualAuthorBindings;
