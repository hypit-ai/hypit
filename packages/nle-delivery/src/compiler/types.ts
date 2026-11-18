import type { AudioFilterProgram } from "@hypit/audio-program";
import type { HtmlPictureReconstruction, HtmlVisual } from "@hypit/html-program";
import type { ResolvedMedia } from "@hypit/media";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
  TemporalRange,
} from "@hypit/temporal/algebra";
import type { LocalSpatialDomain, SpatialMap, SpatialRegion } from "./spatial.js";

export type PictureSourceOutput = {
  readonly signal: "picture";
  readonly spatialDomain: LocalSpatialDomain;
} & (
  | { readonly kind: "signal"; readonly domain: LocalTemporalDomain }
  | { readonly kind: "constant" }
);

export type AudioSourceOutput = {
  readonly signal: "audio";
  readonly kind: "signal";
  readonly domain: LocalTemporalDomain;
};

export type CompiledSourceOutput = PictureSourceOutput | AudioSourceOutput;

/** One resolved Source implementation used by a closed Programme. */
export type CompiledSource = {
  readonly id: string;
  readonly outputs: Readonly<Record<string, CompiledSourceOutput>>;
  readonly content:
    | { readonly kind: "media"; readonly media: ResolvedMedia }
    | { readonly kind: "visual"; readonly visual: HtmlVisual };
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
      readonly reconstruction?: HtmlPictureReconstruction;
    }
  | { readonly kind: "constant" };

/** One stable use of a Source. Trimming changes placement, not Source identity. */
export type Occurrence = {
  readonly id: string;
  readonly source: CompiledSource;
  readonly domain: LocalTemporalDomain;
  readonly placement: OccurrencePlacement;
  readonly selections: Readonly<Record<string, OccurrenceOutputSelection>>;
};

type OperatorInputTemporalSupport = {
  readonly before: ExactTemporalValue;
  readonly after: ExactTemporalValue;
};

export type OperatorTemporalSupport = {
  readonly inputs: Readonly<Record<string, OperatorInputTemporalSupport>>;
  readonly tail: ExactTemporalValue;
};

type Operator = {
  readonly id: string;
  readonly inputs: readonly string[];
  readonly temporalControls: Readonly<Record<string, LocalTemporalDomain>>;
};

export type PictureOperator = Operator & {
  readonly visual: HtmlVisual;
};

export type AudioOperator = Operator & {
  readonly filter: Omit<AudioFilterProgram, "controls">;
};

export type PictureNodeId = string;
export type PictureNode =
  | { readonly kind: "transparent" }
  | { readonly kind: "use"; readonly occurrence: string; readonly output: string }
  | { readonly kind: "restrict"; readonly input: PictureNodeId; readonly range: TemporalRange }
  | { readonly kind: "crop"; readonly input: PictureNodeId; readonly region: SpatialRegion }
  | { readonly kind: "remap"; readonly input: PictureNodeId; readonly mapping: SpatialMap }
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
export type CompilationGraph = {
  readonly id: string;
  readonly domain: LocalTemporalDomain;
  readonly pictureDomain?: LocalSpatialDomain;
  readonly occurrences: Readonly<Record<string, Occurrence>>;
  readonly picture?: PictureGraph;
  readonly audio?: AudioGraph;
};

export type EvaluatedSourceSample = {
  readonly temporal:
    | {
        readonly kind: "signal";
        readonly at: ExactTemporalValue;
        readonly side: "before" | "after";
      }
    | { readonly kind: "constant" };
};

export type EvaluatedPictureNode =
  | { readonly kind: "transparent" }
  | ({ readonly kind: "sample" } & EvaluatedSourceSample)
  | { readonly kind: "alias"; readonly input: PictureNodeId }
  | { readonly kind: "crop"; readonly input: PictureNodeId; readonly region: SpatialRegion }
  | { readonly kind: "remap"; readonly input: PictureNodeId; readonly mapping: SpatialMap }
  | { readonly kind: "over"; readonly inputs: readonly PictureNodeId[] }
  | {
      readonly kind: "apply";
      readonly controlPositions: Readonly<Record<string, ExactTemporalValue>>;
    };

export type EvaluatedPictureGraph = {
  readonly nodes: Readonly<Record<string, EvaluatedPictureNode>>;
};
