export { compositionComponent } from "./component.js";
export { compositionDependency, compositionManifest, compositionModuleRef, compositionTypes } from "./manifest.js";
export {
  audioTrackSchema, visualTimedSamplingSchema,
  compositionSchema,
  visualColorPaintSchema,
  visualPathCommandSchema,
  visualTextDocumentSchema,
  visualTextFlowSchema,
  visualTextPaintSchema,
  visualTextSequenceSchema,
  visualTextTypographySchema,
  visualTrackSchema,
  visualBoxSchema, visualMaskSchema, visualTextSchema, visualImageSchema, visualVideoSchema, visualSurfaceSchema, visualProgramSchema, visualElementSchema,
} from "./schema.js";
export { assertAudioTrackIdentity, assertCompositionIdentity, assertVisualTrackIdentity, sealAudioTrack, sealComposition, sealVisualTrack } from "./track.js";
export { animatableLocalStyles } from "./track.js";
export type * from "./track.js";
