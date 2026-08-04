import { digestOf } from "@svml/protocol";
import type { ModuleManifest, TypeRef, ValueSchema } from "@svml/protocol";

export const contractsModuleRef = { name: "@svml/contracts", version: "0.0.0-dev" } as const;

export const contractTypes = {
  narrative: { module: contractsModuleRef, name: "Narrative" },
  speechBasis: { module: contractsModuleRef, name: "SpeechBasis" },
  speechAudioBasis: { module: contractsModuleRef, name: "SpeechAudioBasis" },
  speechVisualTrack: { module: contractsModuleRef, name: "SpeechVisualTrack" },
  alignedTranscriptEvidence: { module: contractsModuleRef, name: "AlignedTranscriptEvidence" },
  completeSemanticMap: { module: contractsModuleRef, name: "CompleteSemanticMap" },
  timedCaptionProjection: { module: contractsModuleRef, name: "TimedCaptionProjection" },
} satisfies Record<string, TypeRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
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

const artifact = object({
  digest: { schema: digest }, size: { schema: integer }, mediaType: { schema: string }, durationSec: { schema: number },
});
const programSpace = object({
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
  programSpace: { schema: programSpace }, audio: { schema: artifact },
  visualTrack: { schema: object({ clips: { schema: { kind: "array", items: object({
    segmentId: { schema: string }, artifact: { schema: artifact }, startSec: { schema: number }, endSec: { schema: number },
  }) } } }) },
  segments: { schema: { kind: "array", minItems: 1, items: basisSegment } },
});

export const speechAudioBasisSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-audio-basis@1" } },
  basisDigest: { schema: digest }, narrativeDigest: { schema: digest },
  programSpace: { schema: programSpace }, audio: { schema: artifact },
  segments: { schema: { kind: "array", minItems: 1, items: basisSegment } },
});

export const speechVisualTrackSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-visual-track@1" } },
  basisDigest: { schema: digest }, narrativeDigest: { schema: digest },
  programSpace: { schema: programSpace },
  visualTrack: { schema: object({ clips: { schema: { kind: "array", items: object({
    segmentId: { schema: string }, artifact: { schema: artifact },
    startSec: { schema: number }, endSec: { schema: number },
  }) } } }) },
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
  programSpaceDigest: { schema: digest }, evidenceDigest: { schema: digest }, locatorDigest: { schema: digest },
  quantizationPolicy: { schema: { kind: "literal", value: "nearest-frame" } }, durationSec: { schema: number },
  segments: { schema: { kind: "array", items: timedSegment } },
  tokens: { schema: { kind: "array", items: timedToken } },
  anchors: { schema: { kind: "array", items: semanticPoint } },
  groups: { schema: { kind: "array", items: alignmentGroup } }, mapDigest: { schema: digest },
});

const timedCaptionRefinement = object({
  id: { schema: string }, display: { schema: string }, displayStart: { schema: integer }, displayEnd: { schema: integer },
  sourceTokenIds: { schema: { kind: "array", items: string } }, startSec: { schema: number }, endSec: { schema: number },
  startQuality: { schema: quality }, endQuality: { schema: quality },
  relation: { schema: { kind: "literal", value: "exact" } },
});
const timedCaptionRegion = object({
  id: { schema: string }, display: { schema: { kind: "string" } }, segmentId: { schema: string },
  kind: { schema: { kind: "string", enum: ["identity", "alias", "hidden"] } },
  sourceTokenIds: { schema: { kind: "array", items: string } }, startSec: { schema: number }, endSec: { schema: number },
  startQuality: { schema: quality }, endQuality: { schema: quality },
  refinements: { schema: { kind: "array", items: timedCaptionRefinement } },
});
export const timedCaptionProjectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.timed-caption-projection@1" } },
  semanticIndexDigest: { schema: digest }, speechTimeMapDigest: { schema: digest }, text: { schema: { kind: "string" } },
  regions: { schema: { kind: "array", items: timedCaptionRegion } }, projectionDigest: { schema: digest },
});

export const contractsManifest: ModuleManifest = {
  format: "svml.module@0",
  name: contractsModuleRef.name,
  version: contractsModuleRef.version,
  dependencies: [],
  types: [
    { name: contractTypes.narrative.name, schema: narrativeSchema },
    { name: contractTypes.speechBasis.name, schema: speechBasisSchema },
    { name: contractTypes.speechAudioBasis.name, schema: speechAudioBasisSchema },
    { name: contractTypes.speechVisualTrack.name, schema: speechVisualTrackSchema },
    { name: contractTypes.alignedTranscriptEvidence.name, schema: alignedTranscriptEvidenceSchema },
    { name: contractTypes.completeSemanticMap.name, schema: completeSemanticMapSchema },
    { name: contractTypes.timedCaptionProjection.name, schema: timedCaptionProjectionSchema },
  ],
  capabilities: [],
  surfaces: [],
  producers: [],
};

export const contractsManifestDigest = digestOf(contractsManifest);
