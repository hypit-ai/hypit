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
  assertAudioTrackIdentity,
  assertAudioProcessProgram,
  assertAudioReconstructionProgram,
  audioGainProcess,
  audioGraphFromClips,
  audioSignal,
  audioTrackClips,
  AUDIO_GAIN_PROCESS_FORMAT,
  assertCompositionIdentity,
  assertAudioCompositionIdentity,
  assertVisualCompositionIdentity,
  assertVisualItemSequence,
  assertVisualProgram,
  assertVisualProcessEffect,
  assertVisualTextAppearance,
  assertVisualTrackIdentity,
  assertVisualScopeIdentity,
  sealAudioTrack,
  sealComposition,
  sealPresentVisualTrack,
  sealVisualTrack,
  sealVisualProcessEffect,
  sealVisualScope,
  readAudioGainProcess,
  visualScopeTrackOccurrences,
  visualScopeProcesses,
  visualScopeTracks,
  visualAdjustments,
  visualContributionPresents,
  visualElementChildren,
  visualElements,
  visualPresents,
  visualProcesses,
} from "./track.js";
export { visualCompositionVocabulary } from "./introspection.js";
export type * from "./track.js";

export * from "./audio-level-automation.js";
export { audioSampleSpanSchema, audioGainEnvelopeSchema } from "./schema.js";

export { placeComposition } from "./placement.js";
