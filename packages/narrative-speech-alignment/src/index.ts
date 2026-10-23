export { alignWordGroups } from "./align.js";
export { speechAlignmentComponent } from "./component.js";
export { SpeechAlignmentError } from "./error.js";
export { alignNarrative } from "./local.js";
export { materializeNarrativeAlignment } from "./materialize.js";
export { speechAlignmentFragment, speechBoundaryAlignmentFragment } from "./fragment.js";
export {
  speechAlignmentDependency,
  speechAlignmentManifest,
  speechAlignmentMarkupSurfaces,
  speechAlignmentModuleRef,
  speechAlignmentProducers,
} from "./manifest.js";
export { alignCharacters, alignmentCharacters, normalizeForAlignment } from "./normalize.js";
export { decodeSpeechAlignmentSurface } from "./surface.js";
export type * from "./types.js";
