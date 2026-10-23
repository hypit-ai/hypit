export { visualTrackComponent } from "./component.js";
export {
  decodeMediaFit,
  decodeVisualClipSpec,
  decodeMediaFramePaint,
  decodeVisualFrameTreatment,
  decodeMediaSampleAppearance,
  decodeMediaSampleSpec,
  visualMaterialKeys,
} from "./author.js";
export { renderVisualTrackFragment, stillVisualTrackFragment } from "./fragment.js";
export {
  appendMappedStillMediaLayer,
  appendMappedSurfaceMediaLayer,
  appendMappedTimedMediaLayer,
  appendMediaPaintLayer,
  appendStillMediaLayer,
  appendSurfaceMediaLayer,
  appendTimedMediaLayer,
  assertMediaLayerSet,
  assertMediaPaintLayerSpec,
  assertMediaSampleLayerSpec,
  assertMediaVisualSource,
  createMediaLayerSet,
  sealMediaPaintLayerSpec,
  sealMediaSampleLayerSpec,
} from "./layers.js";
export { assertMediaLayerPrograms, resolveMediaLayerPrograms } from "./spatial.js";
export { lowerVisualClipRoot } from "./lower.js";
export { visualClipSpecSchema, visualClipMotionSchema, visualFrameTreatmentSchema, visualSourceTimeSpecSchema, mediaLayerSetSchema, mediaPaintLayerSpecSchema, mediaSampleAppearanceSchema, mediaSampleLayerSpecSchema, mediaSamplingMotionSchema, visualTrackDependency, visualTrackHeaderSchema, visualTrackManifest, visualTrackMarkupSurfaces, visualTrackModuleRef, visualTrackProducers, visualTrackProgramSchema, visualTrackSetSchema, visualTrackTypes } from "./manifest.js";
export {
  assertVisualClipMotion,
  assertVisualMotionPosition,
  poseAnimation,
  resolveVisualMotionPosition,
  sealVisualClipMotion,
  samplingAnimation,
} from "./motion.js";
export { assertVisualFrameTreatment, visualContentFrame } from "./frame-treatment.js";
export { appendVisualClip, bindVisualClipMotion, bindVisualClipPath, assertVisualClipSpec, assertVisualTrackHeader, assertVisualTrackProgram, assertVisualTrackProgramIdentity, assertVisualTrackSet, createVisualTrackSet, finalizeVisualTrack, projectVisualTrack, sealVisualClipSpec, sealVisualTrackHeader, sealVisualTrackProgram } from "./program.js";
export { assertVisualSourceTimeSpec, defaultVisualSourceTimeSpec, resolveVisualSourceTime } from "./source-time.js";
export { decodeMediaSamplingKeyframe, decodeVisualMotionSurface, decodeVisualPoseKeyframe, decodeVisualSourceTimeRelation, decodeVisualSourceTimeSurface, decodeVisualTrackSurface } from "./surface.js";
export type * from "./types.js";

export { visualTreatmentDefaults } from "./author.js";
