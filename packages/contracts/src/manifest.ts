import { digestOf } from "@svml/protocol";
import type { ModuleManifest, TypeRef, ValueSchema } from "@svml/protocol";

import {
  HYPERFRAMES_VISUAL_IR_V1,
  HYPERFRAMES_VISUAL_STYLE_ENUM_VALUES_V1,
  HYPERFRAMES_VISUAL_STYLE_NAMES_V1,
} from "./hyperframes-visual-ir.js";

export const narrativeModuleRef = { name: "@svml/narrative", version: "0.0.0-dev" } as const;
export const mediaModuleRef = { name: "@svml/media", version: "0.0.0-dev" } as const;
export const programSpaceModuleRef = { name: "@svml/program-space", version: "0.0.0-dev" } as const;
export const speechModuleRef = { name: "@svml/speech", version: "0.0.0-dev" } as const;
export const semanticTimeModuleRef = { name: "@svml/semantic-time", version: "0.0.0-dev" } as const;
export const compositionModuleRef = { name: "@svml/composition", version: "0.0.0-dev" } as const;

export const contractTypes = {
  narrative: { module: narrativeModuleRef, name: "Narrative" },
  blobArtifact: { module: mediaModuleRef, name: "BlobArtifact" },
  mediaArtifact: { module: mediaModuleRef, name: "MediaArtifactRef" },
  mediaInspection: { module: mediaModuleRef, name: "MediaInspection" },
  mediaStreamSelection: { module: mediaModuleRef, name: "MediaStreamSelection" },
  synchronizedMedia: { module: mediaModuleRef, name: "SynchronizedMedia" },
  renderedVisual: { module: mediaModuleRef, name: "RenderedVisual" },
  timelineAudio: { module: mediaModuleRef, name: "TimelineAudio" },
  muxedMedia: { module: mediaModuleRef, name: "MuxedMedia" },
  fontArtifact: { module: mediaModuleRef, name: "FontArtifactRef" },
  compositableSurface: { module: mediaModuleRef, name: "CompositableSurfaceRef" },
  programSpace: { module: programSpaceModuleRef, name: "ProgramSpace" },
  speechBasis: { module: speechModuleRef, name: "SpeechBasis" },
  speechAudioBasis: { module: speechModuleRef, name: "SpeechAudioBasis" },
  speechEvidenceAudio: { module: speechModuleRef, name: "SpeechEvidenceAudio" },
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
export const blobArtifactValueSchema: ValueSchema = { kind: "blob" };

const mediaRationalSchema = object({
  numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
  denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
});
const mediaTimestampSchema = object({
  ticks: { schema: { kind: "string", minLength: 1, maxLength: 128 } },
  timeBase: { schema: mediaRationalSchema },
});
const mediaDispositionSchema = object({
  default: { schema: { kind: "boolean" } },
  attachedPicture: { schema: { kind: "boolean" } },
});
const mediaStreamBaseFields = {
  index: { schema: integer },
  codecType: { schema: string },
  codecName: { schema: string },
  disposition: { schema: mediaDispositionSchema },
  timingStatus: { schema: { kind: "string", enum: ["admissible", "missing", "non-monotonic", "discontinuous"] } },
  timeBase: { schema: mediaRationalSchema, optional: true },
  startPts: { schema: mediaTimestampSchema, optional: true },
  endPts: { schema: mediaTimestampSchema, optional: true },
  decodedUnitCount: { schema: integer },
} as const;
const mediaVideoStreamSchema = object({
  ...mediaStreamBaseFields,
  kind: { schema: { kind: "literal", value: "video" } },
  codecType: { schema: { kind: "literal", value: "video" } },
  role: { schema: { kind: "string", enum: ["moving", "attached-picture", "still"] } },
  width: { schema: { kind: "number", integer: true, minimum: 1 } },
  height: { schema: { kind: "number", integer: true, minimum: 1 } },
  averageFrameRate: { schema: mediaRationalSchema, optional: true },
  nominalFrameRate: { schema: mediaRationalSchema, optional: true },
});
const mediaAudioStreamSchema = object({
  ...mediaStreamBaseFields,
  kind: { schema: { kind: "literal", value: "audio" } },
  codecType: { schema: { kind: "literal", value: "audio" } },
  sampleRate: { schema: { kind: "number", integer: true, minimum: 1 } },
  channels: { schema: { kind: "number", integer: true, minimum: 1 } },
  channelLayout: { schema: string, optional: true },
  decodedSampleFrames: { schema: integer },
});
const mediaOtherStreamSchema = object({
  ...mediaStreamBaseFields,
  kind: { schema: { kind: "literal", value: "other" } },
});

export const mediaInspectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.media-inspection@1" } },
  source: { schema: blobArtifactSchema() },
  container: { schema: object({
    formatNames: { schema: { kind: "array", minItems: 1, items: string } },
  }) },
  streams: { schema: {
    kind: "array",
    items: { kind: "oneOf", variants: [mediaVideoStreamSchema, mediaAudioStreamSchema, mediaOtherStreamSchema] },
  } },
  probe: { schema: object({
    algorithm: { schema: { kind: "literal", value: "ffprobe-decoded-units-json@1" } },
    implementation: { schema: string },
  }) },
  inspectionDigest: { schema: digest },
});

export const mediaStreamSelectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.media-stream-selection@1" } },
  sourceArtifactDigest: { schema: digest },
  inspectionDigest: { schema: digest },
  videoStreamIndex: { schema: integer, optional: true },
  audioStreamIndex: { schema: integer, optional: true },
  spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] } },
  policy: { schema: { kind: "string", enum: [
    "primary-moving@1", "default-audio@1", "primary-moving-default-audio@1", "explicit-streams@1",
  ] } },
  selectionDigest: { schema: digest },
});

export const synchronizedMediaSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.synchronized-media@1" } },
  sourceArtifactDigest: { schema: digest },
  inspectionDigest: { schema: digest },
  selectionDigest: { schema: digest },
  timeline: { schema: object({
    spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] } },
    frameRate: { schema: mediaRationalSchema },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
    sampleRate: { schema: { kind: "literal", value: 48_000 } },
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
  sourceMap: { schema: object({
    sourceOriginPts: { schema: mediaTimestampSchema },
    sourceEndPts: { schema: mediaTimestampSchema },
    audioTrimStartSamples: { schema: integer },
    audioTrimEndSamples: { schema: integer },
    audioHeadSamples: { schema: integer },
    audioContentSamples: { schema: integer },
    audioTailSamples: { schema: integer },
  }) },
  visual: { schema: object({
    artifact: { schema: blobArtifactSchema() },
    sourceStreamIndex: { schema: integer },
    width: { schema: { kind: "number", integer: true, minimum: 1 } },
    height: { schema: { kind: "number", integer: true, minimum: 1 } },
    frameRate: { schema: mediaRationalSchema },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
    muted: { schema: { kind: "literal", value: true } },
  }), optional: true },
  audio: { schema: object({
    artifact: { schema: blobArtifactSchema(["audio/wav"]) },
    sourceStreamIndex: { schema: integer },
    codec: { schema: { kind: "literal", value: "pcm_s16le" } },
    sampleRate: { schema: { kind: "literal", value: 48_000 } },
    channels: { schema: { kind: "literal", value: 2 } },
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    loudness: { schema: { kind: "literal", value: "preserved" } },
  }), optional: true },
  normalization: { schema: object({
    algorithm: { schema: { kind: "literal", value: "shared-presentation-origin@1" } },
    implementation: { schema: string },
  }) },
  synchronizedMediaDigest: { schema: digest },
});

export const renderedVisualSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.rendered-visual@1" } },
  renderInputDigest: { schema: digest },
  programSpaceDigest: { schema: digest },
  frameRate: { schema: mediaRationalSchema },
  frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({
    width: { schema: { kind: "number", integer: true, minimum: 1 } },
    height: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
  artifact: { schema: blobArtifactSchema() },
  muted: { schema: { kind: "literal", value: true } },
  visualDigest: { schema: digest },
});

export const timelineAudioSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.timeline-audio@1" } },
  planDigest: { schema: digest },
  programSpaceDigest: { schema: digest },
  artifact: { schema: blobArtifactSchema(["audio/wav"]) },
  codec: { schema: { kind: "literal", value: "pcm_s16le" } },
  sampleRate: { schema: { kind: "literal", value: 48_000 } },
  channels: { schema: { kind: "literal", value: 2 } },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
  loudness: { schema: { kind: "literal", value: "planned" } },
  audioDigest: { schema: digest },
});

export const muxedMediaSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.muxed-media@1" } },
  visualDigest: { schema: digest },
  audioDigest: { schema: digest },
  programSpaceDigest: { schema: digest },
  frameRate: { schema: mediaRationalSchema },
  frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
  canvas: { schema: object({
    width: { schema: { kind: "number", integer: true, minimum: 1 } },
    height: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
  presentationSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
  artifact: { schema: blobArtifactSchema(["video/mp4"]) },
  muxDigest: { schema: digest },
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

export const speechEvidenceAudioSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-evidence-audio@1" } },
  basisDigest: { schema: digest }, narrativeDigest: { schema: digest },
  programSpaceDigest: { schema: digest }, sourceAudioArtifactDigest: { schema: digest },
  artifact: { schema: blobArtifactSchema(["audio/wav"]) },
  codec: { schema: { kind: "literal", value: "pcm_s16le" } },
  sampleRate: { schema: { kind: "literal", value: 16_000 } },
  channels: { schema: { kind: "literal", value: 1 } },
  sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
  durationSec: { schema: number },
  segments: { schema: { kind: "array", minItems: 1, items: basisSegment } },
  sampleMap: { schema: object({
    algorithm: { schema: { kind: "literal", value: "rational-boundary-round@1" } },
    sourceSampleRate: { schema: { kind: "literal", value: 48_000 } },
    evidenceSampleRate: { schema: { kind: "literal", value: 16_000 } },
    sourceSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    evidenceSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    sourceOriginSample: { schema: { kind: "literal", value: 0 } },
    evidenceOriginSample: { schema: { kind: "literal", value: 0 } },
    resamplerImplementation: { schema: string },
  }) },
  evidenceAudioDigest: { schema: digest },
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

const styleDeclaration: ValueSchema = {
  kind: "oneOf",
  variants: HYPERFRAMES_VISUAL_STYLE_NAMES_V1.map((name) => object({
    name: { schema: { kind: "literal", value: name } },
    value: { schema: Object.hasOwn(HYPERFRAMES_VISUAL_STYLE_ENUM_VALUES_V1, name)
      ? {
          kind: "string",
          enum: HYPERFRAMES_VISUAL_STYLE_ENUM_VALUES_V1[
            name as keyof typeof HYPERFRAMES_VISUAL_STYLE_ENUM_VALUES_V1
          ],
        }
      : { kind: "oneOf", variants: [{ kind: "string" }, { kind: "number" }] } },
  })),
};
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
  visualIr: { schema: { kind: "literal", value: HYPERFRAMES_VISUAL_IR_V1 } },
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

export const mediaValidatorDigests = {
  inspection: digestOf("@svml/media/validate-media-inspection@1"),
  selection: digestOf("@svml/media/validate-media-stream-selection@1"),
  synchronized: digestOf("@svml/media/validate-synchronized-media@1"),
  renderedVisual: digestOf("@svml/media/validate-rendered-visual@1"),
  timelineAudio: digestOf("@svml/media/validate-timeline-audio@1"),
  muxedMedia: digestOf("@svml/media/validate-muxed-media@1"),
} as const;

export const mediaManifest: ModuleManifest = {
  format: "svml.module@0",
  name: mediaModuleRef.name,
  version: mediaModuleRef.version,
  dependencies: [],
  types: [
    { name: contractTypes.blobArtifact.name, schema: blobArtifactValueSchema },
    { name: contractTypes.mediaArtifact.name, schema: mediaArtifactSchema },
    {
      name: contractTypes.mediaInspection.name,
      schema: mediaInspectionSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/media/validate-media-inspection",
          digest: mediaValidatorDigests.inspection,
        },
      },
    },
    {
      name: contractTypes.mediaStreamSelection.name,
      schema: mediaStreamSelectionSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/media/validate-media-stream-selection",
          digest: mediaValidatorDigests.selection,
        },
      },
    },
    {
      name: contractTypes.synchronizedMedia.name,
      schema: synchronizedMediaSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/media/validate-synchronized-media",
          digest: mediaValidatorDigests.synchronized,
        },
      },
    },
    {
      name: contractTypes.renderedVisual.name,
      schema: renderedVisualSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/media/validate-rendered-visual",
          digest: mediaValidatorDigests.renderedVisual,
        },
      },
    },
    {
      name: contractTypes.timelineAudio.name,
      schema: timelineAudioSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/media/validate-timeline-audio",
          digest: mediaValidatorDigests.timelineAudio,
        },
      },
    },
    {
      name: contractTypes.muxedMedia.name,
      schema: muxedMediaSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/media/validate-muxed-media",
          digest: mediaValidatorDigests.muxedMedia,
        },
      },
    },
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
    { name: contractTypes.speechEvidenceAudio.name, schema: speechEvidenceAudioSchema },
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

export const compositionValidatorDigests = {
  visualTrack: digestOf("@svml/composition/validate-visual-track@1"),
  audioTrack: digestOf("@svml/composition/validate-audio-track@1"),
  composition: digestOf("@svml/composition/validate-composition@1"),
} as const;

export const compositionManifest: ModuleManifest = {
  format: "svml.module@0",
  name: compositionModuleRef.name,
  version: compositionModuleRef.version,
  dependencies: [
    { module: mediaModuleRef, digest: mediaManifestDigest },
    { module: programSpaceModuleRef, digest: programSpaceManifestDigest },
  ],
  types: [
    {
      name: contractTypes.visualTrack.name,
      schema: visualTrackSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/composition/validate-visual-track",
          digest: compositionValidatorDigests.visualTrack,
        },
      },
    },
    {
      name: contractTypes.audioTrack.name,
      schema: audioTrackSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/composition/validate-audio-track",
          digest: compositionValidatorDigests.audioTrack,
        },
      },
    },
    {
      name: contractTypes.composition.name,
      schema: compositionSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/composition/validate-composition",
          digest: compositionValidatorDigests.composition,
        },
      },
    },
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
