import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalControl,
  TemporalMap,
  TemporalRange,
} from "@hypit/temporal/algebra";
import type { TypeRef } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import type { LocalSpatialDomain, SpatialMap, SpatialRegion } from "@hypit/spatial/algebra";

type ProgramSourceOutputBase = {
  readonly type: TypeRef;
  /** Required when this output is a Picture signal. */
  readonly spatialDomain?: LocalSpatialDomain;
};
/** A finite time-varying signal whose factual local Domain belongs to the Source. */
export type ProgramSignalOutput = ProgramSourceOutputBase & {
  readonly kind: "signal";
  readonly domain: LocalTemporalDomain;
};

/** A timeless value. Its use duration belongs only to an Occurrence, never to the Source. */
export type ProgramConstantOutput = ProgramSourceOutputBase & {
  readonly kind: "constant";
};

export type ProgramSourceOutput = ProgramSignalOutput | ProgramConstantOutput;

/** One already-resolved multi-output Source that can be used by a Program. */
export type ProgramSource = {
  readonly id: string;
  readonly outputs: Readonly<Record<string, ProgramSourceOutput>>;
};

/**
 * Placement of one active occurrence-local range in a finite parent domain.
 * `start` is the parent position corresponding to `active.start`.
 */
export type OccurrencePlacement = {
  readonly parent: LocalTemporalDomain;
  readonly start: ExactTemporalValue;
  readonly active: TemporalRange;
};

/**
 * One stable use of a Source. Its local domain remains stable across trims;
 * placement selects the active part and Mapping reads the Source domain.
 */
export type Occurrence = {
  readonly id: string;
  readonly source: ProgramSource;
  readonly domain: LocalTemporalDomain;
  readonly placement: OccurrencePlacement;
  /** Selected outputs. Only a time-varying signal owns an occurrence-to-source Mapping. */
  readonly selections: Readonly<Record<string, OccurrenceOutputSelection>>;
};

export type OccurrenceOutputSelection =
  | {
      readonly kind: "signal";
      readonly mapping: TemporalMap;
      /** Package-owned reconstruction of this target-to-source signal read. */
      readonly reconstruction?: SignalReconstruction;
    }
  | { readonly kind: "constant" };

/** First value-owned interpolation policy; it linearly interpolates affine coefficients. */
export type SpatialMapInterpolation = { readonly kind: "affine-linear" };
export type SpatialMapControl = TemporalControl<SpatialMap, SpatialMapInterpolation>;

/** Opaque package-owned execution programme; consumers support formats, not effect names. */
export type SignalOperatorProgram = {
  readonly format: string;
  readonly payload: { readonly [key: string]: CanonicalValue };
  readonly artifacts: readonly BlobRef[];
};

/** Package-owned policy for reconstructing one signal through a temporal Mapping. */
export type SignalReconstruction = {
  readonly signal: TypeRef;
  readonly program: SignalOperatorProgram;
};

/** Relative input positions required to produce one output position. */
export type OperatorInputTemporalSupport = {
  readonly before: ExactTemporalValue;
  readonly after: ExactTemporalValue;
};

/**
 * Time dependency of one Operator, independent of any concrete effect.
 * Durations are exact and non-negative. A sequential state declares the
 * finite pre-roll needed before an independently requested output range.
 */
export type OperatorTemporalSupport = {
  readonly inputs: Readonly<Record<string, OperatorInputTemporalSupport>>;
  readonly state:
    | { readonly kind: "independent" }
    | { readonly kind: "sequential"; readonly preRoll: ExactTemporalValue };
  /** Execution availability delay; it does not shift Programme time. */
  readonly latency: ExactTemporalValue;
  /** Possible output after the last non-empty input sample. */
  readonly tail: ExactTemporalValue;
};

export type PictureNodeId = string;

/** Package-owned Picture transform. Port names, not child order, define its inputs. */
export type PictureOperator = {
  readonly id: string;
  readonly inputs: readonly string[];
  /** Package-owned temporal Controls expose only their named coordinate domains to AVIR. */
  readonly temporalControls: Readonly<Record<string, LocalTemporalDomain>>;
  readonly temporalSupport: OperatorTemporalSupport;
  readonly program: SignalOperatorProgram;
};

export type PictureNode =
  | { readonly kind: "transparent" }
  | { readonly kind: "use"; readonly occurrence: string; readonly output: string }
  | { readonly kind: "restrict"; readonly input: PictureNodeId; readonly range: TemporalRange }
  | { readonly kind: "crop"; readonly input: PictureNodeId; readonly region: SpatialRegion }
  | { readonly kind: "remap"; readonly input: PictureNodeId; readonly mapping: SpatialMap }
  | {
      readonly kind: "remap-control";
      readonly input: PictureNodeId;
      readonly control: SpatialMapControl;
      /** Closed Programme-to-Control coordinate relation. */
      readonly controlMapping: TemporalMap;
    }
  | { readonly kind: "over"; readonly inputs: readonly PictureNodeId[] }
  | {
      readonly kind: "apply";
      readonly operator: PictureOperator;
      readonly inputs: Readonly<Record<string, PictureNodeId>>;
      readonly controlMappings: Readonly<Record<string, TemporalMap>>;
    };

export type PictureGraph = {
  readonly nodes: Readonly<Record<PictureNodeId, PictureNode>>;
  readonly root: PictureNodeId;
};

export type AudioNodeId = string;

/** Package-owned Audio transform. Named ports express effect and sidechain roles. */
export type AudioOperator = {
  readonly id: string;
  readonly inputs: readonly string[];
  /** Package-owned temporal Controls expose only their named coordinate domains to AVIR. */
  readonly temporalControls: Readonly<Record<string, LocalTemporalDomain>>;
  readonly temporalSupport: OperatorTemporalSupport;
  readonly program: SignalOperatorProgram;
};

export type AudioNode =
  | { readonly kind: "silence" }
  | { readonly kind: "use"; readonly occurrence: string; readonly output: string }
  | { readonly kind: "restrict"; readonly input: AudioNodeId; readonly range: TemporalRange }
  | { readonly kind: "mix"; readonly inputs: readonly AudioNodeId[] }
  | {
      readonly kind: "apply";
      readonly operator: AudioOperator;
      readonly inputs: Readonly<Record<string, AudioNodeId>>;
      readonly controlMappings: Readonly<Record<string, TemporalMap>>;
    };

export type AudioGraph = {
  readonly nodes: Readonly<Record<AudioNodeId, AudioNode>>;
  readonly root: AudioNodeId;
};

/** One closed multi-output audiovisual Programme on a shared finite parent domain. */
export type AudiovisualProgram = {
  readonly id: string;
  readonly domain: LocalTemporalDomain;
  /** Finite output Space required exactly when the Programme produces Picture. */
  readonly pictureDomain?: LocalSpatialDomain;
  readonly occurrences: Readonly<Record<string, Occurrence>>;
  readonly picture?: PictureGraph;
  readonly audio?: AudioGraph;
};

export type EvaluatedSourceSample = {
  readonly occurrence: string;
  readonly output: string;
  readonly source: string;
  readonly reconstruction?: SignalReconstruction;
  readonly temporal:
    | {
        readonly kind: "signal";
        readonly domain: LocalTemporalDomain;
        readonly at: ExactTemporalValue;
        readonly side: "before" | "after";
      }
    | { readonly kind: "constant" };
};

export type EvaluatedPictureNode =
  | { readonly kind: "transparent" }
  | ({ readonly kind: "sample"; readonly sourceSpace: LocalSpatialDomain } & EvaluatedSourceSample)
  | { readonly kind: "alias"; readonly input: PictureNodeId }
  | { readonly kind: "crop"; readonly input: PictureNodeId; readonly region: SpatialRegion }
  | { readonly kind: "remap"; readonly input: PictureNodeId; readonly mapping: SpatialMap }
  | { readonly kind: "over"; readonly inputs: readonly PictureNodeId[] }
  | {
      readonly kind: "apply";
      readonly operator: PictureOperator;
      readonly inputs: Readonly<Record<string, PictureNodeId>>;
      readonly controlPositions: Readonly<Record<string, ExactTemporalValue>>;
    };

export type EvaluatedPictureGraph = {
  readonly domain: LocalSpatialDomain;
  readonly nodes: Readonly<Record<PictureNodeId, EvaluatedPictureNode>>;
  readonly root: PictureNodeId;
};

export type EvaluatedAudioNode =
  | { readonly kind: "silence" }
  | ({ readonly kind: "sample" } & EvaluatedSourceSample)
  | { readonly kind: "alias"; readonly input: AudioNodeId }
  | { readonly kind: "mix"; readonly inputs: readonly AudioNodeId[] }
  | {
      readonly kind: "apply";
      readonly operator: AudioOperator;
      readonly inputs: Readonly<Record<string, AudioNodeId>>;
      readonly controlPositions: Readonly<Record<string, ExactTemporalValue>>;
    };

export type EvaluatedAudioGraph = {
  readonly nodes: Readonly<Record<AudioNodeId, EvaluatedAudioNode>>;
  readonly root: AudioNodeId;
};

/** Exact clock-free evaluation. An Output policy chooses which `at` values to request. */
export type AudiovisualEvaluation = {
  readonly program: string;
  readonly at: ExactTemporalValue;
  readonly picture?: EvaluatedPictureGraph;
  readonly audio?: EvaluatedAudioGraph;
};
