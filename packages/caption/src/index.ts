export {
  assertCaptionDocument,
  assertCaptionUnitSubset,
  captionUnitsForRole,
} from "./display.js";
export type { CaptionUnitSubset } from "./display.js";
export { captionWordsForAttribute } from "./display.js";
export { assertCaptionDocumentIdentity } from "./identity.js";
export { captionComponent } from "./component.js";export { captionDocumentSchema, captionDependency, captionProgramSchema, captionStyleSchema, captionTimingSchema, captionManifest, captionModuleRef, captionProducers, captionTypes } from "./manifest.js";
export {
  assertCaptionProgram,
  assertCaptionProgramForDocument,
  assertCaptionStyle,
  appendCaptionUse,
  sealCaptionProgram,
  sealCaptionStyle,
} from "./style.js";
export { assertCaptionTiming, assertCaptionTimingForDocument } from "./temporalize.js";
export type * from "./types.js";

export { captionUseVisibility } from "./visibility.js";
export { captionDocumentDeclaration, captionDocumentFromDeclaration, captionDocumentAuthorDeclaration, captionDocumentMarkupDeclaration } from "./document-declaration.js";
export { captionTimingAuthorDeclaration, captionTimingMarkupDeclaration } from "./timing-declaration.js";
export { createAbsoluteCaptionTiming } from "./absolute-timing.js";
export type { CaptionTimingSpec } from "./absolute-timing.js";
export { hiddenCaptionStyleAuthorDeclaration } from "./declaration.js";export { hiddenCaptionStyleMarkupDeclaration } from "./declaration.js";

export { captionCueText, captionTextAuthorDeclaration, captionTextMarkupDeclaration } from "./text-declaration.js";
