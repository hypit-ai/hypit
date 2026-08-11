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
  speechSpineVisualSpecSchema,
  speechSpineSurfaceImplementationDigest,
} from "./manifest.js";
export {
  appendSpeechSpineAudioTake,
  appendSpeechSpineAudioTakeImplementationDigest,
  appendSpeechSpineVisualTake,
  appendSpeechSpineVisualTakeImplementationDigest,
  assembleSpeechBasis,
  assembleSpeechBasisImplementationDigest,
  assertSpeechSpineProgram,
  assertSpeechSpineSet,
  assertSpeechSpineVisualSpec,
  compileSpeechSpineAudio,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSet,
  createSpeechSpineSetImplementationDigest,
  sealSpeechSpineProgram,
  sealSpeechSpineVisualSpec,
} from "./program.js";
export { decodeSpeechSpineSurface } from "./surface.js";
export type * from "./types.js";
