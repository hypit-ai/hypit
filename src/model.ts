export type Literal = string | number | boolean;

export type Reference = {
  kind: "reference";
  path: string;
};

export type AttributeValue = Literal | Reference;

export type ParameterSource = {
  kind: "kernel-default" | "svs-class" | "instance";
  source: string;
  value: AttributeValue;
};

export type SourceElement = {
  kind: "element";
  name: string;
  attributes: Record<string, AttributeValue>;
  children: SourceNode[];
  start: number;
  end: number;
  origin?: {
    file: string;
    localId?: string;
  };
  parameterSources?: Record<string, ParameterSource[]>;
};

export type SourceText = {
  kind: "text";
  value: string;
  start: number;
  end: number;
};

export type SourceNode = SourceElement | SourceText;

export type SourceModuleRecord = {
  kind: "svml" | "svc" | "svs";
  uri: string;
  contentHash: string;
  dependencies: string[];
};

export type SourceDocument = {
  file: string;
  source: string;
  root: SourceElement;
  scriptSource: string;
  scriptOffset: number;
  modules?: SourceModuleRecord[];
};

export type ScriptAtom =
  | { kind: "text"; speech: string; caption: string; start: number; end: number }
  | { kind: "role"; label: string; start: number; end: number };

export type ScriptToken = {
  id: string;
  index: number;
  segmentId: string;
  text: string;
  normalized: string;
  sourceStart: number;
  sourceEnd: number;
};

export type MarkerBoundary = {
  tokenIndex: number;
  segmentId?: string;
  structuralCut?: number;
};

export type SelectionOccurrence = {
  id: string;
  occurrence: number;
  open: {
    affinity: "left" | "right";
    boundary: MarkerBoundary;
    sourceStart: number;
  };
  close: {
    affinity: "left" | "right";
    boundary: MarkerBoundary;
    sourceStart: number;
  };
};

export type MomentOccurrence = {
  id: string;
  occurrence: number;
  affinity: "left" | "right";
  boundary: MarkerBoundary;
  sourceStart: number;
};

export type ScriptSegment = {
  id: string;
  index: number;
  atoms: ScriptAtom[];
  tokenStart: number;
  tokenEnd: number;
  sourceStart: number;
  sourceEnd: number;
};

export type CaptionAtom = {
  id: string;
  display: string;
  segmentId: string;
  startWord: number;
  endWordExclusive: number;
  sourceStart: number;
  sourceEnd: number;
};

export type NarrativeIR = {
  segments: ScriptSegment[];
  tokens: ScriptToken[];
  selections: Record<string, SelectionOccurrence[]>;
  moments: Record<string, MomentOccurrence[]>;
  captionAtoms: CaptionAtom[];
  projections: {
    dialogue: string;
    speech: string;
    caption: string;
  };
};

export type AlignmentWord = {
  text: string;
  startSec: number;
  endSec: number;
  segmentId: string;
};

export type AlignmentSegment = {
  id: string;
  startSec: number;
  endSec: number;
};

export type AlignmentCaptionCue = {
  id?: string;
  startWord: number;
  endWordExclusive: number;
};

export type AlignmentEvidence = {
  contract: "svml.speech-alignment.v1";
  durationSec: number;
  fps: number;
  words: AlignmentWord[];
  segments: AlignmentSegment[];
  captionCues?: AlignmentCaptionCue[];
  provenance?: Record<string, unknown>;
};

export type ProgramRange = {
  startFrame: number;
  endFrameExclusive: number;
  startSec: number;
  endSec: number;
};

export type LocatedSelection = {
  id: string;
  ranges: ProgramRange[];
};

export type LocatedMoment = {
  id: string;
  frames: number[];
};

export type LocatedCaptionCue = ProgramRange & {
  id: string;
  startWord: number;
  endWordExclusive: number;
};

export type LocatedCaptionAtom = CaptionAtom & ProgramRange;

export type LocatedScript = {
  durationFrames: number;
  durationSec: number;
  fps: number;
  words: Array<ScriptToken & ProgramRange>;
  segments: Record<string, ProgramRange>;
  selections: Record<string, LocatedSelection>;
  moments: Record<string, LocatedMoment>;
  captionAtoms: LocatedCaptionAtom[];
  captionCues?: LocatedCaptionCue[];
};

export type PlanValue = {
  id: string;
  type: "Image" | "Video" | "Audio" | "Text";
  source?: string;
  value?: string;
  identity: string;
  module: string;
  localId: string;
  contentDigest?: string;
  digestStatus?: "content" | "unresolved-source";
};

export type PlanInstance = {
  id: string;
  kernel: string;
  identity: string;
  module: string;
  localId: string;
  attributes: Record<string, AttributeValue>;
  effectiveParameters: Record<string, {
    value: AttributeValue;
    sources: ParameterSource[];
  }>;
  children: SourceNode[];
  dependencies: string[];
  executionDigest?: string;
};

export type PlanIR = {
  contract: "svml.plan.v1";
  source: string;
  values: PlanValue[];
  instances: PlanInstance[];
  kernels: Array<{
    name: string;
    abiVersion: string;
    manifestHash: string;
    implementationHash: string;
    profile: "isolated-projector-v1" | "capability-v1";
    capability?: string;
    ports: Array<{
      name: string;
      direction: "input" | "output";
      type: string;
      cardinality: string;
      consume?: "one" | "each" | "set";
    }>;
    parameters: Array<{
      name: string;
      styleName: string;
      type: "string" | "number" | "boolean";
      defaultValue?: AttributeValue;
    }>;
    children: Array<{
      name: string;
      cardinality: string;
      text: boolean;
      fields: Array<{
        name: string;
        styleName: string;
        type: string;
        required: boolean;
        consume?: "one" | "each" | "set";
      }>;
      children: unknown[];
    }>;
  }>;
  root: string;
  edges: Array<{
    from: string;
    to: string;
    via: string;
    fromPort?: string;
    toPort?: string;
    type?: string;
  }>;
};
