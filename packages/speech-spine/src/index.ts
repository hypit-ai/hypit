/** Official Speech Spine authoring and deterministic basis assembly. */
export { speechSpineComponent } from "./component.js";
export { createSpeechSpineFragment } from "./fragment.js";
export { speechSpineManifest, speechSpineMarkupSurfaces, speechSpineModuleRef, speechSpineProducers, speechSpineTypes, speechSpineProgramSchema, speechSpineSetSchema, speechSpineVisualSpecSchema } from "./manifest.js";
export { appendSpeechSpineAudioTake, appendSpeechSpineVisualTake, assembleSpeechBasis, assertSpeechSpineProgram, assertSpeechSpineSet, assertSpeechSpineVisualSpec, compileSpeechSpineAudio, createSpeechSpineSet, sealSpeechSpineProgram, sealSpeechSpineVisualSpec } from "./program.js";
export { decodeSpeechSpineSurface } from "./surface.js";
export type * from "./types.js";
