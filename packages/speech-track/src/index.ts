/** Official Speech Track authoring and deterministic SemanticTrack assembly. */
export { speechTrackComponent } from "./component.js";
export { createSpeechTrackFragment } from "./fragment.js";
export { speechTrackManifest, speechTrackMarkupSurfaces, speechTrackModuleRef, speechTrackProducers, speechTrackTypes, speechTrackHeaderSchema, speechTrackSetSchema } from "./manifest.js";
export { appendSpeechTrackTake, assembleSpeechTrack, assertSpeechTrackHeader, assertSpeechTrackSet, createSpeechTrackSet, sealSpeechTrackHeader } from "./program.js";
export { decodeSpeechTrackSurface } from "./surface.js";
export type * from "./types.js";
