export { visualTrackComponent } from "./component.js";
export {
  decodeMediaFit,
  decodeVisualClipSpec,
  decodeMediaFramePaint,
  decodeVisualFrameTreatment,
  decodeMediaSampleAppearance,
  decodeMediaSampleSpec,
  visualMaterialKeys,
  visualMaterialOptions,
} from "./author.js";
export { renderVisualTrackFragment, stillVisualTrackFragment } from "./fragment.js";
export {
  createVisualTrackFragment,
  decodeMediaSamplingKeyframe,
  decodeVisualPoseKeyframe,
  visualMotionAuthorDeclaration,
  visualTrackAuthorDeclaration,
  visualTrackAuthorDeclarations,
} from "./declaration.js";
export {
  appendMappedStillMediaLayer,
  appendMappedSurfaceMediaLayer,
  appendMappedTimedMediaLayer,
  appendCompositionLayer,
  appendMediaPaintLayer,
  appendStillMediaLayer,
  appendSurfaceMediaLayer,
  appendTimedMediaLayer,
  assertMediaLayerSet,
  assertMediaPaintLayerSpec,
  assertMediaSampleLayerSpec,
  assertVisualSource,
  createMediaLayerSet,
  sealMediaPaintLayerSpec,
  sealMediaSampleLayerSpec,
} from "./layers.js";
export { assertMediaLayerPrograms, resolveMediaLayerPrograms } from "./spatial.js";
export { lowerVisualClipElement, lowerVisualClipRoot } from "./lower.js";export { visualClipSpecSchema, visualClipMotionSchema, visualTransitionEffectSchema, visualTransitionSpecSchema, visualFrameTreatmentSchema, mediaLayerSetSchema, mediaPaintLayerSpecSchema, mediaSampleAppearanceSchema, mediaSampleLayerSpecSchema, mediaSamplingMotionSchema, visualTrackDependency, visualTrackHeaderSchema, visualTrackManifest, visualTrackModuleRef, visualTrackProducers, visualTrackProgramSchema, visualTrackSetSchema, visualTrackTypes } from "./manifest.js";
export {
  assertVisualClipMotion,
  assertVisualMotionPosition,
  poseAnimation,
  resolveVisualMotionPosition,
  sealVisualClipMotion,
  samplingAnimation,
} from "./motion.js";
export { assertVisualFrameTreatment, visualContentFrame } from "./frame-treatment.js";
export { appendVisualClip, appendVisualTransition, bindVisualClipMotion, bindVisualClipPath, assertVisualClipSpec, assertVisualTransitionEffect, assertVisualTransitionSpec, assertVisualTrackHeader, assertVisualTrackProgram, assertVisualTrackProgramIdentity, assertVisualTrackSet, createVisualTrackSet, finalizeVisualTrack, projectVisualTrack, sealVisualClipSpec, sealVisualTransitionEffect, sealVisualTrackHeader, sealVisualTrackProgram, visualTransitionSpan } from "./program.js";export { visualTrackMarkupDeclarations } from "./declaration.js";
export type * from "./types.js";

export { visualTreatmentDefaults } from "./author.js";
