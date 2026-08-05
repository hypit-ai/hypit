import { digestOf } from "@svml/protocol";
import type { ModuleManifest, TypeRef, ValueSchema } from "@svml/protocol";

export const narrativeModuleRef = { name: "@svml/narrative", version: "0.0.0-dev" } as const;
export const mediaModuleRef = { name: "@svml/media", version: "0.0.0-dev" } as const;
export const programSpaceModuleRef = { name: "@svml/program-space", version: "0.0.0-dev" } as const;
export const speechModuleRef = { name: "@svml/speech", version: "0.0.0-dev" } as const;
export const semanticTimeModuleRef = { name: "@svml/semantic-time", version: "0.0.0-dev" } as const;
export const compositionModuleRef = { name: "@svml/composition", version: "0.0.0-dev" } as const;

export const contractTypes = {
  narrative: { module: narrativeModuleRef, name: "Narrative" },
  mediaArtifact: { module: mediaModuleRef, name: "MediaArtifactRef" },
  fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  compositableSurface: { module: mediaModuleRef, name: "CompositableSurfaceRef" },
  programSpace: { module: programSpaceModuleRef, name: "ProgramSpace" },
  speechBasis: { module: speechModuleRef, name: "SpeechBasis" },
  speechAudioBasis: { module: speechModuleRef, name: "SpeechAudioBasis" },
  alignedTranscriptEvidence: { module: semanticTimeModuleRef, name: "AlignedTranscriptEvidence" },
  completeSemanticMap: { module: semanticTimeModuleRef, name: "CompleteSemanticMap" },
  visualTrack: { module: compositionModuleRef, name: "VisualTrack" },
  audioTrack: { module: compositionModuleRef, name: "AudioTrack" },
  composition: { module: compositionModuleRef, name: "Composition" },
} satisfies Record<string, TypeRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const signedInteger = { kind: "number", integer: true } as const;
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>, allowUnknown = false): ValueSchema => ({
  kind: "object",
  fields,
  ...(allowUnknown ? { allowUnknown: true } : {}),
});

const markerBoundary = object({
  tokenIndex: { schema: integer },
  structuralPosition: { schema: integer },
  segmentId: { schema: string, optional: true },
});
const markerEdge = object({
  affinity: { schema: { kind: "string", enum: ["left", "right"] } },
  boundary: { schema: markerBoundary },
});

export const narrativeSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.narrative@0" } },
  segments: { schema: { kind: "array", minItems: 1, items: object({
    id: { schema: string }, index: { schema: integer }, startAnchorId: { schema: string },
    endAnchorId: { schema: string }, tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
  }) } },
  tokens: { schema: { kind: "array", items: object({
    id: { schema: string }, index: { schema: integer }, segmentId: { schema: string },
    segmentTokenIndex: { schema: integer }, startAnchorId: { schema: string }, endAnchorId: { schema: string },
    text: { schema: string }, normalized: { schema: string },
  }) } },
  turns: { schema: { kind: "array", items: object({
    id: { schema: string }, segmentId: { schema: string }, role: { schema: string, optional: true },
    tokenStart: { schema: integer }, tokenEndExclusive: { schema: integer },
  }) } },
  selections: { schema: { kind: "array", items: object({
    id: { schema: string }, occurrences: { schema: { kind: "array", minItems: 1, items: object({
      occurrence: { schema: integer }, open: { schema: markerEdge }, close: { schema: markerEdge },
    }) } },
  }) } },
  moments: { schema: { kind: "array", items: object({
    id: { schema: string }, occurrences: { schema: { kind: "array", minItems: 1, items: object({
      occurrence: { schema: integer }, affinity: { schema: { kind: "string", enum: ["left", "right"] } },
      boundary: { schema: markerBoundary },
    }) } },
  }) } },
  captionProjection: { schema: object({
    contract: { schema: { kind: "literal", value: "svml.caption-projection@0" } },
    text: { schema: { kind: "string" } },
    regions: { schema: { kind: "array", items: object({
      id: { schema: string }, display: { schema: { kind: "string" } }, segmentId: { schema: string },
      startToken: { schema: integer }, endTokenExclusive: { schema: integer },
      kind: { schema: { kind: "string", enum: ["identity", "alias", "hidden"] } },
      refinements: { schema: { kind: "array", items: object({
        id: { schema: string }, display: { schema: string }, displayStart: { schema: integer },
        displayEnd: { schema: integer }, startToken: { schema: integer }, endTokenExclusive: { schema: integer },
        relation: { schema: { kind: "literal", value: "exact" } },
      }) } },
    }) } },
  }) },
  semanticIndex: { schema: object({
    contract: { schema: { kind: "literal", value: "svml.semantic-index@0" } },
    anchors: { schema: { kind: "array", minItems: 2, items: object({
      id: { schema: string },
      kind: { schema: { kind: "string", enum: ["segment-start", "token-start", "token-end", "segment-end"] } },
      segmentId: { schema: string }, tokenId: { schema: string, optional: true },
      segmentTokenIndex: { schema: integer, optional: true },
    }) } },
    digest: { schema: digest },
  }) },
  serializations: { schema: object({
    dialogue: { schema: { kind: "string" } }, speech: { schema: { kind: "string" } },
  }) },
});

export const mediaArtifactSchema = object({
  digest: { schema: digest }, size: { schema: integer }, mediaType: { schema: string }, durationSec: { schema: number },
});
const blobArtifactSchema = (mediaTypes?: readonly string[]): ValueSchema => object({
  kind: { schema: { kind: "literal", value: "blob" } },
  digest: { schema: digest },
  size: { schema: integer },
  mediaType: { schema: mediaTypes === undefined ? string : { kind: "string", enum: mediaTypes } },
});
export const fontArtifactSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.font-artifact@1" } },
  artifact: { schema: blobArtifactSchema(["font/otf", "font/ttf", "font/woff", "font/woff2"]) },
  weight: { schema: { kind: "number", integer: true, minimum: 1, maximum: 1_000 } },
  style: { schema: { kind: "string", enum: ["normal", "italic", "oblique"] } },
});
const surfaceTimingSchema: ValueSchema = {
  kind: "oneOf",
  variants: [
    object({ kind: { schema: { kind: "literal", value: "still" } } }),
    object({
      kind: { schema: { kind: "literal", value: "frames" } },
      frameRate: { schema: object({ numerator: { schema: integer }, denominator: { schema: integer } }) },
      frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
    }),
  ],
};
export const compositableSurfaceSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.compositable-surface@1" } },
  artifact: { schema: blobArtifactSchema() },
  width: { schema: { kind: "number", integer: true, minimum: 1 } },
  height: { schema: { kind: "number", integer: true, minimum: 1 } },
  colorSpace: { schema: { kind: "literal", value: "srgb" } },
  alphaMode: { schema: { kind: "string", enum: ["opaque", "straight"] } },
  timing: { schema: surfaceTimingSchema },
});
export const programSpaceSchema = object({
  contract: { schema: { kind: "literal", value: "svml.program-space@0" } },
  digest: { schema: digest }, durationSec: { schema: number },
  frameRate: { schema: object({ numerator: { schema: integer }, denominator: { schema: integer } }) },
});
const basisSegment = object({
  segmentId: { schema: string }, startSec: { schema: number }, endSec: { schema: number },
  sourceArtifactDigest: { schema: digest },
});

export const speechBasisSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-basis@1" } },
  basisDigest: { schema: digest }, narrativeDigest: { schema: digest },
  programSpace: { schema: programSpaceSchema }, audio: { schema: mediaArtifactSchema },
  visualTrack: { schema: object({ clips: { schema: { kind: "array", items: object({
    segmentId: { schema: string }, artifact: { schema: mediaArtifactSchema }, startSec: { schema: number }, endSec: { schema: number },
  }) } } }) },
  segments: { schema: { kind: "array", minItems: 1, items: basisSegment } },
});

export const speechAudioBasisSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-audio-basis@1" } },
  basisDigest: { schema: digest }, narrativeDigest: { schema: digest },
  programSpace: { schema: programSpaceSchema }, audio: { schema: mediaArtifactSchema },
  segments: { schema: { kind: "array", minItems: 1, items: basisSegment } },
});

const wordEvidence = object({
  text: { schema: { kind: "string" } }, startSec: { schema: number, optional: true },
  endSec: { schema: number, optional: true }, score: { schema: { kind: "number", minimum: 0, maximum: 1 }, optional: true },
});
const charEvidence = object({
  char: { schema: { kind: "string" } }, wordIndex: { schema: integer }, startSec: { schema: number, optional: true },
  endSec: { schema: number, optional: true }, score: { schema: { kind: "number", minimum: 0, maximum: 1 }, optional: true },
});
export const alignedTranscriptEvidenceFields = {
  contract: { schema: { kind: "literal", value: "svml.aligned-transcript-evidence@1" } },
  basisDigest: { schema: digest }, audioArtifactDigest: { schema: digest }, programSpaceDigest: { schema: digest },
  rawEvidenceArtifactDigest: { schema: digest }, evidenceDigest: { schema: digest }, durationSec: { schema: number },
  segments: { schema: { kind: "array", minItems: 1, items: object({
    sourceSegmentId: { schema: string }, startSec: { schema: number }, endSec: { schema: number },
    words: { schema: { kind: "array", items: wordEvidence } },
    chars: { schema: { kind: "array", items: charEvidence } },
    speechActivity: { schema: { kind: "array", items: object({ startSec: { schema: number }, endSec: { schema: number } }) }, optional: true },
  }) } },
} as const satisfies Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>;
export const alignedTranscriptEvidenceSchema: ValueSchema = object(alignedTranscriptEvidenceFields);

const quality = { kind: "string", enum: ["measured", "derived", "estimated"] } as const;
const timedSegment = object({
  segmentId: { schema: string }, startSec: { schema: number }, endSec: { schema: number },
  startFrame: { schema: integer }, endFrame: { schema: integer },
  startQuality: { schema: quality }, endQuality: { schema: quality },
});
const timedToken = object({
  tokenId: { schema: string }, segmentId: { schema: string }, startSec: { schema: number }, endSec: { schema: number },
  startFrame: { schema: integer }, endFrame: { schema: integer },
  startQuality: { schema: quality }, endQuality: { schema: quality },
});
const semanticPoint = object({
  identity: { schema: string }, timeSec: { schema: number }, frame: { schema: integer }, quality: { schema: quality },
});
const alignmentGroup = object({
  sourceSegmentId: { schema: string }, sourceTokenIds: { schema: { kind: "array", items: string } },
  evidenceWordStart: { schema: integer }, evidenceWordEndExclusive: { schema: integer },
  relation: {
    schema: {
      kind: "string",
      enum: ["exact", "split", "merge", "replacement", "source-omission", "evidence-insertion"],
    },
  },
  cost: { schema: number },
});

export const completeSemanticMapSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.complete-semantic-map@1" } },
  semanticIndexDigest: { schema: digest }, basisDigest: { schema: digest }, audioArtifactDigest: { schema: digest },
  programSpaceDigest: { schema: digest }, programSpace: { schema: programSpaceSchema },
  evidenceDigest: { schema: digest }, locatorDigest: { schema: digest },
  quantizationPolicy: { schema: { kind: "literal", value: "nearest-frame" } }, durationSec: { schema: number },
  segments: { schema: { kind: "array", items: timedSegment } },
  tokens: { schema: { kind: "array", items: timedToken } },
  anchors: { schema: { kind: "array", items: semanticPoint } },
  groups: { schema: { kind: "array", items: alignmentGroup } }, mapDigest: { schema: digest },
});

const styleDeclaration = object({
  name: { schema: string },
  value: { schema: { kind: "oneOf", variants: [{ kind: "string" }, { kind: "number" }] } },
});
const visualAttribute = object({ name: { schema: string }, value: { schema: { kind: "string" } } });
const visualKeyframe = object({
  atFrame: { schema: integer },
  easing: { schema: { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] }, optional: true },
  style: { schema: { kind: "array", minItems: 1, items: styleDeclaration } },
});
const visualAnimation = object({
  keyframes: { schema: { kind: "array", minItems: 2, items: visualKeyframe } },
});
const visualBaseFields = {
  id: { schema: string },
  parent: { schema: string, optional: true },
  order: { schema: integer },
  style: { schema: { kind: "array", items: styleDeclaration } },
  attributes: { schema: { kind: "array", items: visualAttribute }, optional: true },
  animation: { schema: visualAnimation, optional: true },
} as const satisfies Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>;
const boxElement = object({ ...visualBaseFields, kind: { schema: { kind: "literal", value: "box" } } });
const textElement = object({
  ...visualBaseFields,
  kind: { schema: { kind: "literal", value: "text" } },
  text: { schema: { kind: "string" } },
  fonts: { schema: { kind: "array", minItems: 1, items: fontArtifactSchema }, optional: true },
});
const mediaElement = (kind: "image" | "video") => object({
  ...visualBaseFields,
  kind: { schema: { kind: "literal", value: kind } },
  artifact: { schema: mediaArtifactSchema },
  mediaStartSec: { schema: number, optional: true },
  playbackRate: { schema: number, optional: true },
  loop: { schema: { kind: "boolean" }, optional: true },
  muted: { schema: { kind: "boolean" }, optional: true },
});
const surfaceElement = object({
  ...visualBaseFields,
  kind: { schema: { kind: "literal", value: "surface" } },
  surface: { schema: compositableSurfaceSchema },
});
const visualElement: ValueSchema = {
  kind: "oneOf",
  variants: [boxElement, textElement, mediaElement("image"), mediaElement("video"), surfaceElement],
};
const frameSpan = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
const visualPresent = object({
  id: { schema: string },
  span: { schema: frameSpan },
  stacking: { schema: object({ order: { schema: signedInteger }, tieBreak: { schema: string } }) },
  elements: { schema: { kind: "array", minItems: 1, items: visualElement } },
});
const trackSource = object({ name: { schema: string }, digest: { schema: digest } });

export const visualTrackSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.visual-track@1" } },
  digest: { schema: digest },
  id: { schema: string },
  programSpaceDigest: { schema: digest },
  sources: { schema: { kind: "array", items: trackSource } },
  presents: { schema: { kind: "array", items: visualPresent } },
});

const audioClip = object({
  id: { schema: string },
  span: { schema: frameSpan },
  artifact: { schema: mediaArtifactSchema },
  mediaStartSec: { schema: number, optional: true },
  playbackRate: { schema: number, optional: true },
  gain: { schema: number, optional: true },
  fadeInSec: { schema: number, optional: true },
  fadeOutSec: { schema: number, optional: true },
  bus: { schema: { kind: "string", enum: ["speech", "music", "sfx", "source"] }, optional: true },
});

export const audioTrackSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.audio-track@1" } },
  digest: { schema: digest },
  id: { schema: string },
  programSpaceDigest: { schema: digest },
  sources: { schema: { kind: "array", items: trackSource } },
  clips: { schema: { kind: "array", items: audioClip } },
});

export const compositionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.composition@1" } },
  digest: { schema: digest },
  id: { schema: string },
  programSpace: { schema: programSpaceSchema },
  canvas: { schema: object({
    width: { schema: integer },
    height: { schema: integer },
    clearColor: { schema: string },
  }) },
  tracks: { schema: { kind: "array", items: { kind: "oneOf", variants: [visualTrackSchema, audioTrackSchema] } } },
});

export const narrativeManifest: ModuleManifest = {
  format: "svml.module@0",
  name: narrativeModuleRef.name,
  version: narrativeModuleRef.version,
  dependencies: [],
  types: [{ name: contractTypes.narrative.name, schema: narrativeSchema }],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const mediaManifest: ModuleManifest = {
  format: "svml.module@0",
  name: mediaModuleRef.name,
  version: mediaModuleRef.version,
  dependencies: [],
  types: [
    { name: contractTypes.mediaArtifact.name, schema: mediaArtifactSchema },
    { name: contractTypes.fontArtifact.name, schema: fontArtifactSchema },
    { name: contractTypes.compositableSurface.name, schema: compositableSurfaceSchema },
  ],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const programSpaceManifest: ModuleManifest = {
  format: "svml.module@0",
  name: programSpaceModuleRef.name,
  version: programSpaceModuleRef.version,
  dependencies: [],
  types: [{ name: contractTypes.programSpace.name, schema: programSpaceSchema }],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const narrativeManifestDigest = digestOf(narrativeManifest);
export const mediaManifestDigest = digestOf(mediaManifest);
export const programSpaceManifestDigest = digestOf(programSpaceManifest);

export const speechManifest: ModuleManifest = {
  format: "svml.module@0",
  name: speechModuleRef.name,
  version: speechModuleRef.version,
  dependencies: [
    { module: narrativeModuleRef, digest: narrativeManifestDigest },
    { module: mediaModuleRef, digest: mediaManifestDigest },
    { module: programSpaceModuleRef, digest: programSpaceManifestDigest },
  ],
  types: [
    { name: contractTypes.speechBasis.name, schema: speechBasisSchema },
    { name: contractTypes.speechAudioBasis.name, schema: speechAudioBasisSchema },
  ],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const speechManifestDigest = digestOf(speechManifest);

export const semanticTimeManifest: ModuleManifest = {
  format: "svml.module@0",
  name: semanticTimeModuleRef.name,
  version: semanticTimeModuleRef.version,
  dependencies: [
    { module: narrativeModuleRef, digest: narrativeManifestDigest },
    { module: speechModuleRef, digest: speechManifestDigest },
    { module: programSpaceModuleRef, digest: programSpaceManifestDigest },
  ],
  types: [
    { name: contractTypes.alignedTranscriptEvidence.name, schema: alignedTranscriptEvidenceSchema },
    { name: contractTypes.completeSemanticMap.name, schema: completeSemanticMapSchema },
  ],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const compositionManifest: ModuleManifest = {
  format: "svml.module@0",
  name: compositionModuleRef.name,
  version: compositionModuleRef.version,
  dependencies: [
    { module: mediaModuleRef, digest: mediaManifestDigest },
    { module: programSpaceModuleRef, digest: programSpaceManifestDigest },
  ],
  types: [
    { name: contractTypes.visualTrack.name, schema: visualTrackSchema },
    { name: contractTypes.audioTrack.name, schema: audioTrackSchema },
    { name: contractTypes.composition.name, schema: compositionSchema },
  ],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const semanticTimeManifestDigest = digestOf(semanticTimeManifest);
export const compositionManifestDigest = digestOf(compositionManifest);

export const videoContractManifests = [
  narrativeManifest,
  mediaManifest,
  programSpaceManifest,
  speechManifest,
  semanticTimeManifest,
  compositionManifest,
] as const;

export const videoContractDependencies = {
  narrative: { module: narrativeModuleRef, digest: narrativeManifestDigest },
  media: { module: mediaModuleRef, digest: mediaManifestDigest },
  programSpace: { module: programSpaceModuleRef, digest: programSpaceManifestDigest },
  speech: { module: speechModuleRef, digest: speechManifestDigest },
  semanticTime: { module: semanticTimeModuleRef, digest: semanticTimeManifestDigest },
  composition: { module: compositionModuleRef, digest: compositionManifestDigest },
} as const;
