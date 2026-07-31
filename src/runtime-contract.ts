import type {
  AlignmentEvidence,
  AttributeValue,
  LocatedScript,
  NarrativeIR,
  PlanIR,
  PlanInstance,
  PlanValue,
  ProgramRange,
  SourceElement,
} from "./model.js";

export type VisualFragment = {
  id: string;
  kind: "image" | "video" | "html";
  startFrame: number;
  endFrameExclusive: number;
  z: number;
  layer?: number;
  source?: string;
  mediaStartSec?: number;
  playbackRate?: number;
  loop?: boolean;
  muted?: boolean;
  html?: string;
  css?: string;
  style?: Record<string, string | number>;
  innerStyle?: Record<string, string | number>;
  attributes?: Record<string, string>;
};

export type AudioFragment = {
  id: string;
  source: string;
  startFrame: number;
  endFrameExclusive: number;
  mediaStartSec?: number;
  playbackRate?: number;
  volume?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  bus?: "speech" | "music" | "sfx" | "source";
};

export type KernelProjection = {
  outputs: Record<string, unknown>;
  visuals?: VisualFragment[];
  audios?: AudioFragment[];
  styles?: string[];
  diagnostics?: Array<{ code: string; message: string }>;
};

export type HyperframesDocument = {
  contract: "svml.hyperframes-document.v1";
  id: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  background: string;
  visuals: VisualFragment[];
  audios: AudioFragment[];
  styles?: string[];
};

export type RuntimeValue = PlanValue & {
  absoluteSource?: string;
};

export type KernelContext = {
  instance: PlanInstance;
  element: SourceElement;
  narrative: NarrativeIR;
  located: LocatedScript;
  alignment: AlignmentEvidence;
  plan: PlanIR;
  values: Map<string, RuntimeValue>;
  results: Map<string, KernelProjection>;
  resolve: (value: AttributeValue | undefined) => unknown;
  resolvePath: (path: string) => unknown;
  temporalContracts: Record<string, {
    kind: "selection" | "moment";
    consume: "one" | "each" | "set";
  }>;
  selection: (value: AttributeValue | undefined, contract: string) => ProgramRange[];
  moment: (value: AttributeValue | undefined, contract: string) => number[];
  fps: number;
  width: number;
  height: number;
};

export type KernelImplementation = {
  abiVersion: "1";
  project(context: KernelContext): Promise<KernelProjection> | KernelProjection;
};
