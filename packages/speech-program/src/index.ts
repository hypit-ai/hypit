/** Official reusable speech composition; not a generic Fragment registry. */
export {
  captionTrackFragment,
  captionTimingFragment,
  speechTakeProjectionFragment,
} from "./speech.js";
export { whisperXSpeechAlignmentFragment } from "@svml/whisperx";
export { speechProgramComponent } from "./component.js";
export { createSpeechSpineFragment } from "./fragment.js";
export {
  speechProgramManifest,
  speechProgramManifestDigest,
  speechProgramModuleRef,
  speechProgramProducers,
  speechProgramTypes,
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
