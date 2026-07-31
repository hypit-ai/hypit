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
    expansionDigest?: string;
    callSite?: { file: string; start: number; end: number };
    definitionSite?: { file: string; start: number; end: number };
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
  kind: "svml" | "svc" | "svs" | "svk";
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
  expansions?: Array<{
    instanceId: string;
    component: string;
    manifestHash: string;
    expansionDigest: string;
    internalIds: string[];
    exports: Record<string, string>;
  }>;
};

export type ScriptAtom =
  | { kind: "text"; speech: string; caption: string; start: number; end: number }
  | { kind: "role"; label: string; start: number; end: number };

export type ScriptToken = {
  id: string;
  index: number;
  segmentId: string;
  segmentTokenIndex: number;
  startAnchorId: string;
  endAnchorId: string;
  text: string;
  normalized: string;
  sourceStart: number;
  sourceEnd: number;
};

export type MarkerBoundary = {
  tokenIndex: number;
  segmentId?: string;
  structuralPosition: number;
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
  startAnchorId: string;
  endAnchorId: string;
  atoms: ScriptAtom[];
  tokenStart: number;
  tokenEnd: number;
  sourceStart: number;
  sourceEnd: number;
};

export type SemanticAnchorKind =
  | "segment-start"
  | "token-start"
  | "token-end"
  | "segment-end";

export type SemanticAnchorIdentity = {
  id: string;
  kind: SemanticAnchorKind;
  segmentId: string;
  tokenId?: string;
  segmentTokenIndex?: number;
};

export type SemanticIndex = {
  contract: "svml.semantic-index.v1";
  anchors: SemanticAnchorIdentity[];
  tokens: Array<{
    id: string;
    segmentId: string;
    segmentTokenIndex: number;
    normalized: string;
    startAnchorId: string;
    endAnchorId: string;
  }>;
  digest: string;
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
  semanticIndex: SemanticIndex;
  projections: {
    dialogue: string;
    speech: string;
    caption: string;
  };
};

export type Rational = {
  numerator: number;
  denominator: number;
};

export type ProgramBasis = {
  contract: "svml.program-basis.v1";
  frameRate: Rational;
  originFrame: 0;
  durationFrames: number;
  basisDigest: string;
};

export type ProgramPoint = {
  basisDigest: string;
  frame: number;
};

export type SemanticPointQuality = "estimated" | "derived" | "measured";

export type SemanticAnchorPoint = {
  identity: string;
  point: ProgramPoint;
  quality: SemanticPointQuality;
};

export type SemanticMapBase = {
  semanticIndexDigest: string;
  basisDigest: string;
  anchors: SemanticAnchorPoint[];
  evidenceDigests: string[];
  locatorDigest: string;
  quantizationPolicy: "nearest-frame";
  captionCues?: AlignmentCaptionCue[];
  mapDigest: string;
};

export type EstimatedSemanticMap = SemanticMapBase & {
  contract: "svml.estimated-semantic-map.v1";
};

export type ExactSemanticMap = SemanticMapBase & {
  contract: "svml.exact-semantic-map.v1";
};

export type SemanticMap = EstimatedSemanticMap | ExactSemanticMap;

export type SourceToProgramMap = {
  id: string;
  sourceId: string;
  sourceDigest: string;
  sourceStartFrame: number;
  sourceEndFrameExclusive: number;
  programStartFrame: number;
  programEndFrameExclusive: number;
};

export type ProgramAudioContribution = {
  id: string;
  sourceId: string;
  sourceDigest: string;
  source: string;
  sourceMapId: string;
  sourceStartFrame: number;
  sourceEndFrameExclusive: number;
  programStartFrame: number;
  programEndFrameExclusive: number;
  gain: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
};

export type TemporalBasisProduction = {
  contract: "svml.temporal-basis-production.v1";
  basis: ProgramBasis;
  alignmentSubjects: Array<{
    id: string;
    sourceId: string;
    sourceDigest: string;
    sourceMapId: string;
  }>;
  sourceMaps: SourceToProgramMap[];
  audio: ProgramAudioContribution[];
  facets: Record<string, unknown>;
  productionDigest: string;
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
  contract: "svml.temporal-binding.v1";
  precision: "estimated" | "exact";
  basisDigest: string;
  semanticMapDigest: string;
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
  type: "Image" | "Video" | "Audio" | "Text" | "AlignmentEvidence";
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
  expansionDigest?: string;
  sourceMap?: {
    callSite: { file: string; start: number; end: number };
    definitionSite: { file: string; start: number; end: number };
  };
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
    profile: "isolated-projector-v1" | "capability-v1" | "composite-v1";
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
      type: string;
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
  expansions: NonNullable<SourceDocument["expansions"]>;
  edges: Array<{
    from: string;
    to: string;
    via: string;
    fromPort?: string;
    toPort?: string;
    type?: string;
  }>;
};
