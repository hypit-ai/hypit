import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalControl,
  TemporalMap,
  TemporalRange,
} from "@hypit/temporal/algebra";
import type { LocalSpatialDomain, SpatialMap, SpatialRegion } from "./spatial.js";

/** npm selects the implementation version; `symbol` is stable inside that package. */
export type PackageSymbol = {
  readonly package: string;
  readonly symbol: string;
};

/** Closed package-owned parameters. The defining package validates their domain meaning. */
export type ImplementationBinding = {
  readonly implementation: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
};

export type ProgramPictureOutput = {
  readonly signal: "picture";
  readonly spatialDomain: LocalSpatialDomain;
} & (
  | { readonly kind: "signal"; readonly domain: LocalTemporalDomain }
  | { readonly kind: "constant" }
);

export type ProgramAudioOutput = {
  readonly signal: "audio";
  readonly kind: "signal";
  readonly domain: LocalTemporalDomain;
};

export type ProgramSourceOutput = ProgramPictureOutput | ProgramAudioOutput;

/** One resolved Source implementation used by a closed Programme. */
export type ProgramSource = ImplementationBinding & {
  readonly id: string;
  readonly outputs: Readonly<Record<string, ProgramSourceOutput>>;
};

export type OccurrencePlacement = {
  readonly parent: LocalTemporalDomain;
  readonly start: ExactTemporalValue;
  readonly active: TemporalRange;
};

export type OccurrenceOutputSelection =
  | {
      readonly kind: "signal";
      readonly mapping: TemporalMap;
      /** Package-owned interpretation of this exact mapped read, not of the Source itself. */
      readonly reconstruction?: SignalReconstruction;
    }
  | { readonly kind: "constant" };

/** One stable use of a Source. Trimming changes placement, not Source identity. */
export type Occurrence = {
  readonly id: string;
  readonly source: ProgramSource;
  readonly domain: LocalTemporalDomain;
  readonly placement: OccurrencePlacement;
  readonly selections: Readonly<Record<string, OccurrenceOutputSelection>>;
};

export type SpatialMapInterpolation = { readonly kind: "affine-linear" };
export type SpatialMapControl = TemporalControl<SpatialMap, SpatialMapInterpolation>;

export type OperatorInputTemporalSupport = {
  readonly before: ExactTemporalValue;
  readonly after: ExactTemporalValue;
};

export type OperatorTemporalSupport = {
  readonly inputs: Readonly<Record<string, OperatorInputTemporalSupport>>;
  readonly tail: ExactTemporalValue;
};

/** Explicit non-default reconstruction of one mapped Picture or Audio read. */
export type SignalReconstruction = ImplementationBinding & {
  readonly signal: "picture" | "audio";
};

export type PictureOperator = ImplementationBinding & {
  readonly id: string;
  readonly inputs: readonly string[];
  readonly temporalControls: Readonly<Record<string, LocalTemporalDomain>>;
  readonly temporalSupport: OperatorTemporalSupport;
};

export type AudioOperator = ImplementationBinding & {
  readonly id: string;
  readonly inputs: readonly string[];
  readonly temporalControls: Readonly<Record<string, LocalTemporalDomain>>;
  readonly temporalSupport: OperatorTemporalSupport;
};

export type PictureNodeId = string;
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

/** Closed invocation-local audiovisual Programme. */
export type AudiovisualProgram = {
  readonly id: string;
  readonly domain: LocalTemporalDomain;
  readonly pictureDomain?: LocalSpatialDomain;
  readonly occurrences: Readonly<Record<string, Occurrence>>;
  readonly picture?: PictureGraph;
  readonly audio?: AudioGraph;
};

export type EvaluatedSourceSample = {
  readonly occurrence: string;
  readonly output: string;
  readonly source: string;
  readonly implementation: PackageSymbol;
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

/** Exact point evaluation. Output policy decides which positions to request. */
export type AudiovisualEvaluation = {
  readonly program: string;
  readonly at: ExactTemporalValue;
  readonly picture?: EvaluatedPictureGraph;
  readonly audio?: EvaluatedAudioGraph;
};
