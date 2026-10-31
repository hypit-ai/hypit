export { compositionComponent } from "./component.js";
export { compositionDependency, compositionManifest, compositionModuleRef, compositionTypes } from "./manifest.js";
export {
  audioTrackSchema,
  compositionSchema,
  visualColorPaintSchema,
  visualPathCommandSchema,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextSequenceSchema,
  visualTextTypographySchema,
  visualTrackSchema,
  visualAdjustmentSchema, visualPresentSchema, visualProcessSchema, visualItemSchema,
  visualScopeSchema, visualProgramCarrierSchema, audioReconstructionProgramSchema,
  visualProcessEffectSchema,
  visualMaskSchema, visualTextSchema, visualImageSchema, visualVideoSchema, visualSurfaceSchema, visualProgramSchema, visualElementSchema,
} from "./schema.js";
export {
  audioGraphFromClips,
  audioSignal,
  audioTrackClips,
  sealAudioTrack,
} from "./audio.js";
export {
  sealComposition,
  sealVisualScope,
  visualScopeTrackOccurrences,
  visualScopeProcesses,
  visualScopeTracks,
} from "./scope.js";
export {
  sealPresentVisualTrack,
  sealVisualTrack,
  visualAdjustments,
  visualContributionPresents,
  visualElementChildren,
  visualElements,
  visualPresents,
  visualProcesses,
} from "./visual.js";
export {
  assertAudioTrackIdentity,
  assertAudioProcessProgram,
  assertAudioReconstructionProgram,
  assertCompositionIdentity,
  assertAudioCompositionIdentity,
  assertVisualCompositionIdentity,
  assertVisualItemSequence,
  assertVisualProgram,
  assertVisualProcessEffect,
  assertVisualTextAppearance,
  assertVisualTrackIdentity,
  assertVisualScopeIdentity,
  sealVisualProcessEffect,
} from "./validation.js";
export { visualCompositionVocabulary } from "./introspection.js";
export type * from "./types.js";

export * from "./audio-level-automation.js";
export { audioSampleSpanSchema, audioGainEnvelopeSchema } from "./schema.js";
