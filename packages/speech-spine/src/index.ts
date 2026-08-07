/** Official Speech Spine authoring and deterministic basis assembly. */
export { speechSpineComponent } from "./component.js";
export { createSpeechSpineFragment } from "./fragment.js";
export {
  speechSpineManifest,
  speechSpineManifestDigest,
  speechSpineModuleRef,
  speechSpineProducers,
  speechSpineTypes,
  speechSpineProgramSchema,
  speechSpineSetSchema,
  speechSpineSurfaceImplementationDigest,
} from "./manifest.js";
export {
  appendSpeechSpineTake,
  appendSpeechSpineTakeImplementationDigest,
  assembleSpeechBasis,
  assembleSpeechBasisImplementationDigest,
  assertSpeechSpineProgram,
  assertSpeechSpineSet,
  compileSpeechSpineAudio,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSet,
  createSpeechSpineSetImplementationDigest,
  sealSpeechSpineProgram,
} from "./program.js";
export { decodeSpeechSpineSurface } from "./surface.js";
export type * from "./types.js";
