export { CaptionTimingError } from "./error.js";
export {
  assertCaptionDocument,
  assertCaptionUnitSubset,
  captionUnitsForRole,
  captionUnitsForSelection,
} from "./display.js";
export type { CaptionUnitSubset } from "./display.js";
export { captionWordsForAttribute } from "./display.js";
export { captionComponent } from "./component.js";
export { captionTimingFragment, plannedCaptionTimingFragment } from "./fragment.js";
export {
  captionProgramSchema,
  captionStyleSchema,
  timedCaptionProjectionSchema,
  captionManifest,
  captionMarkupSurfaces,
  captionModuleRef,
  captionProducers,
  captionTypes,
} from "./manifest.js";
export { decodeCaptionProgramSurface } from "./surface.js";
export {
  assertCaptionProgram,
  assertCaptionProgramForDocument,
  assertCaptionStyle,
  resolveCaptionProgram,
  sealCaptionProgram,
  sealCaptionStyle,
} from "./style.js";
export type { CaptionMuteApplication, CaptionStyleApplication, CaptionWordStyleApplication } from "./style.js";
export { applyCaptionMute, assertTimedCaptionProjection, temporalizeCaptionDocument } from "./temporalize.js";
export type * from "./types.js";
