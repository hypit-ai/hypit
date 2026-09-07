export { mediaTrackComponent } from "./component.js";
export {
  decodeMediaFit,
  decodeMediaFramePaint,
  decodeMediaMotion,
  decodeMediaPresentation,
  decodeMediaSampleAppearance,
  decodeMediaSampleSpec,
  mediaAppearanceKeys,
} from "./author.js";
export { renderMediaTrackFragment, stillMediaTrackFragment } from "./fragment.js";
export {
  appendMediaPaintLayer,
  appendStillMediaLayer,
  appendSurfaceMediaLayer,
  appendTimedMediaLayer,
  assertMediaLayerSet,
  assertMediaPaintLayerSpec,
  assertMediaSampleLayerSpec,
  assertMediaVisualOccupancy,
  assertMediaVisualSource,
  createMediaLayerSet,
  sealMediaPaintLayerSpec,
  sealMediaSampleLayerSpec,
} from "./layers.js";
export { lowerMediaItemElements } from "./lower.js";
export { mediaItemSpecSchema, mediaFramePresentationSchema, mediaLifecycleMotionSchema, mediaLayerSetSchema, mediaHandoffSpecSchema, mediaPaintLayerSpecSchema, mediaSampleAppearanceSchema, mediaSampleLayerSpecSchema, mediaSamplingMotionSchema, mediaSoundSetSchema, mediaSoundSpecSchema, mediaSequenceMemberSetSchema, mediaSequenceMemberSpecSchema, mediaSequenceSpecSchema, mediaTrackDependency, mediaTrackHeaderSchema, mediaTrackManifest, mediaTrackMarkupSurfaces, mediaTrackModuleRef, mediaTrackProducers, mediaTrackProgramSchema, mediaTrackSetSchema, mediaTrackTypes } from "./manifest.js";
export {
  assertMediaEdgeMotion,
  assertMediaLifecycleMotion,
  assertMediaSustainMotion,
  lifecycleAnimation,
  samplingAnimation,
  lifecycleAnimationWindow,
  resolveMediaLifecycleMotion,
  sustainAnimation,
  sustainAnimationWindow,
} from "./motion.js";
export { assertMediaFramePresentation } from "./presentation.js";
export {
  appendMediaSound,
  assertMediaSoundSet,
  assertMediaSoundSpec,
  createMediaSoundSet,
  sealMediaSoundSpec,
} from "./sounds.js";
export { appendMediaItem, appendMediaSequence, bindMediaItemClipPath, bindMediaSequenceClipPath, assertMediaItemSpec, assertMediaTrackHeader, assertMediaTrackProgram, assertMediaTrackProgramIdentity, assertMediaTrackSet, createMediaTrackSet, finalizeMediaTrack, projectMediaAudioTrack, projectMediaVisualTrack, sealMediaItemSpec, sealMediaTrackHeader, sealMediaTrackProgram } from "./program.js";
export { resolveVisualSampling } from "./sampling.js";
export { lowerRestrictedSpeechVisualPresents } from "./restricted-speech.js";
export type { RestrictedSpeechVisualClip } from "./restricted-speech.js";
export { decodeMediaSamplingKeyframe, decodeMediaTrackSurface } from "./surface.js";
export {
  appendMediaSequenceMember,
  assertMediaHandoffSpec,
  assertMediaSequenceMemberSet,
  assertMediaSequenceMemberSpec,
  assertMediaSequenceSpec,
  createMediaSequenceMemberSet,
  lowerMediaSequencePresents,
  resolveMediaSequence,
  sealMediaHandoffSpec,
  sealMediaSequenceMemberSpec,
  sealMediaSequenceSpec,
  sequenceMemberHandoffAnimation,
} from "./sequence.js";
export type * from "./types.js";
