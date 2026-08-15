export { audioTrackComponent } from "./component.js";
export { createAudioTrackFragment, programAudioTrackFragment } from "./fragment.js";
export type { AudioTrackFragmentItem } from "./fragment.js";
export { audioClipSpecSchema, audioTrackDependency, audioTrackHeaderSchema, audioTrackManifest, audioTrackMarkupSurfaces, audioTrackModuleRef, audioTrackProducers, audioTrackProgramSchema, audioTrackSetSchema, audioTrackTypes } from "./manifest.js";
export { decodeAudioTrackSurface } from "./surface.js";
export { appendMomentAudioItem, appendProgramAudioItem, appendSelectionAudioItem, assertAudioClipSpec, assertAudioTrackHeader, assertAudioTrackProgram, assertAudioTrackSet, createAudioTrackSet, finalizeAudioTrack, renderAudioTrack, sealAudioClipSpec, sealAudioTrackHeader, sealAudioTrackProgram } from "./program.js";
export type * from "./types.js";
