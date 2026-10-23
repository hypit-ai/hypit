export { audioMixComponent } from "./component.js";
export { createAudioMixFragment } from "./fragment.js";
export { audioMixHeaderSchema, audioMixInputSpecSchema, audioMixManifest, audioMixMarkupSurfaces, audioMixModuleRef,
  audioMixProducers, audioMixSetSchema, audioMixTypes } from "./manifest.js";
export { appendAudioMixInput, assertAudioMixSet, createAudioMixSet, finalizeAudioMix, sealAudioMixHeader, sealAudioMixInputSpec } from "./program.js";
export { decodeAudioMixSurface } from "./surface.js";
export type * from "./types.js";
