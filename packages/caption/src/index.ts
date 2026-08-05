export { CaptionProjectionError } from "./error.js";
export {
  captionImplementationDigest,
  captionManifest,
  captionModuleRef,
  captionProducers,
  captionTrackProgramSchema,
  captionTypes,
  timedCaptionProjectionSchema,
} from "./manifest.js";
export { planCaptionPresentation } from "./presentation.js";
export { temporalizeCaption } from "./temporalize.js";
export {
  assertCaptionTrackProgram,
  computeCaptionTrackProgramDigest,
  defaultCaptionTrackProgram,
  renderCaptionTrack,
  renderCaptionTrackImplementationDigest,
  sealCaptionTrackProgram,
} from "./track.js";
export type * from "./types.js";
