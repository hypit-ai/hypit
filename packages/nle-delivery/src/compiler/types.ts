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

export type SourceContent =
  | { readonly kind: "media"; readonly media: ResolvedMedia }
  | { readonly kind: "visual"; readonly visual: HtmlVisual };

export type ResolvedSource = {
  readonly content: SourceContent;
  readonly picture?: {
    readonly spatialDomain: LocalSpatialDomain;
    readonly time?: LocalTemporalDomain;
    readonly itemTimeControl?: string;
  };
  readonly audio?: LocalTemporalDomain;
};

export type PictureRead = {
  readonly spatialDomain: LocalSpatialDomain;
  readonly itemTime?: { readonly name: string; readonly mapping: TemporalMap };
} & (
  | { readonly kind: "constant" }
  | { readonly kind: "signal"; readonly mapping: TemporalMap; readonly reconstruction?: HtmlPictureReconstruction }
);

export type OccurrencePlacement = {
  readonly parent: LocalTemporalDomain;
  readonly start: ExactTemporalValue;
  readonly active: TemporalRange;
};

export type Occurrence = {
  readonly id: string;
  readonly content: SourceContent;
  readonly domain: LocalTemporalDomain;
  readonly placement: OccurrencePlacement;
  readonly picture?: PictureRead;
  readonly audio?: TemporalMap;
};

export type PictureNodeId = string;
export type PictureNode =
  | { readonly kind: "transparent"; readonly spatialDomain: LocalSpatialDomain }
  | { readonly kind: "use"; readonly occurrence: string }
  | { readonly kind: "restrict"; readonly input: PictureNodeId; readonly range: TemporalRange }
  | { readonly kind: "crop"; readonly input: PictureNodeId; readonly region: SpatialRegion }
  | { readonly kind: "remap"; readonly input: PictureNodeId; readonly mapping: SpatialMap }
  | { readonly kind: "over"; readonly inputs: readonly PictureNodeId[] }
  | {
      readonly kind: "apply";
      readonly visual: HtmlVisual;
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
  | { readonly kind: "use"; readonly occurrence: string }
  | { readonly kind: "restrict"; readonly input: AudioNodeId; readonly range: TemporalRange }
  | { readonly kind: "mix"; readonly inputs: readonly AudioNodeId[] }
  | {
      readonly kind: "apply";
      readonly filter: AudioFilterProgram["filter"];
      readonly input: AudioNodeId;
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
