export { CaptionProjectionError } from "./error.js";
export { captionComponent } from "./component.js";
export {
  captionImplementationDigest,
  captionManifest,
  captionModuleRef,
  captionProducers,
  captionTrackProgramSchema,
  captionTypes,
  captionValidatorDigests,
  timedCaptionProjectionSchema,
} from "./manifest.js";
export { planCaptionPresentation } from "./presentation.js";
export { temporalizeCaption } from "./temporalize.js";
export {
  assertCaptionTrackProgram,
  assertTimedCaptionProjection,
  computeCaptionTrackProgramDigest,
  defaultCaptionTrackProgram,
  renderCaptionTrack,
  renderCaptionTrackImplementationDigest,
  sealCaptionTrackProgram,
} from "./track.js";
export type * from "./types.js";
