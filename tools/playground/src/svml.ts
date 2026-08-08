/**
 * The browser-safe surface of the compiler, in one place.
 *
 * Almost every package the playground needs is pure, but
 * `@narratage/hyperframes`'s entry re-exports `stageHyperframesProject`, which
 * writes a project to disk through `node:fs/promises`. Importing the package
 * entry would therefore drag a filesystem into the browser for a function the
 * playground never calls, so the document module is imported by path instead.
 *
 * Everything else the playground uses goes through this module too, so the
 * boundary is one file to audit rather than an import convention to remember.
 */

export {
  assertHyperframesDocument,
  compileHyperframesDocument,
  materializeHyperframesHtml,
} from "../../../packages/hyperframes/src/document.js";
export type { HyperframesDocument } from "../../../packages/hyperframes/src/types.js";

export {
  sealComposition,
  sealVisualTrack,
  assertCompositionIdentity,
} from "@narratage/composition";
export type {
  Composition,
  FrameSpan,
  Track,
  VisualElement,
  VisualPresent,
  VisualStyleDeclaration,
  VisualTrack,
} from "@narratage/composition";

export { programSpaceFrameCount, sealProgramSpace } from "@narratage/program-space";
export type { ProgramSpace } from "@narratage/program-space";

export type { CanonicalValue, ValueSchema } from "@narratage/protocol";

// Component lowering. These are the real renderers the compiler runs, so what
// the playground shows is the production visual result and not a lookalike.
export {
  renderCaptionTrack,
  sealCaptionTrackProgram,
} from "@narratage/caption";
export type {
  CaptionPresentationMode,
  CaptionTrackProgram,
  TimedCaptionProjection,
  TimedCaptionRegion,
} from "@narratage/caption";

export { renderTextTrack, sealTextTrackProgram } from "@narratage/text-track";
export type { TextItem, TextTrackProgram } from "@narratage/text-track";
