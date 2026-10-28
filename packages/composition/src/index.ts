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
  visualBoxSchema, visualMaskSchema, visualTextSchema, visualImageSchema, visualVideoSchema, visualSurfaceSchema, visualProgramSchema, visualElementSchema,
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
  assertVisualTextAppearance,
  assertVisualTrackIdentity,
  assertVisualScopeIdentity,
  sealAudioTrack,
  sealComposition,
  sealPresentVisualTrack,
  sealVisualTrack,
  sealVisualScope,
  readAudioGainProcess,
  visualScopeTrackOccurrences,
  visualScopeTracks,
  visualAdjustments,
  visualContributionPresents,
  visualElementChildren,
  visualElements,
  visualPresents,
  visualProcesses,
} from "./track.js";
export { animatableLocalStyles } from "./track.js";
export { visualCompositionVocabulary } from "./introspection.js";
export type * from "./track.js";

export * from "./audio-level-automation.js";
export { audioSampleSpanSchema, audioGainEnvelopeSchema } from "./schema.js";
export {
  assertVisualStyleV1,
  VISUAL_IR_V1,
  VISUAL_STYLE_ENUM_VALUES_V1,
  VISUAL_STYLE_NAMES_V1,
} from "./visual.js";
export type { VisualStyleNameV1 } from "./visual.js";
