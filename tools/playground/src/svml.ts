/**
 * The browser-safe surface of the compiler, in one place.
 *
 * Almost every package the playground needs is pure, but
 * `@narratage/hyperframes`'s entry re-exports `stageHyperframesProject`, which
 * writes a project to disk through `node:fs/promises`. Importing the package
 * entry would therefore drag a filesystem into the browser for a function the
 * playground never calls, so the document module is imported by path instead.
 *
 * Only the render path is named here. Components are not: they are discovered
 * from the manifests at run time, and a list of them in this file would be the
 * very coupling the discovery exists to avoid.
 */

export {
  assertHyperframesDocument,
  compileHyperframesDocument,
  materializeHyperframesHtml,
} from "../../../packages/hyperframes/src/document.js";
export type { HyperframesDocument } from "../../../packages/hyperframes/src/types.js";

export { sealComposition } from "@narratage/composition";
export type { Composition, Track, VisualTrack } from "@narratage/composition";

export {
  defaultProgramSpace,
  programSpaceFrameCount,
  sealProgramSpace,
} from "@narratage/program-space";
export type { ProgramSpace } from "@narratage/program-space";

export { validateStoredValue } from "@narratage/core";

export type {
  CanonicalValue,
  ModuleManifest,
  ProducerDeclaration,
  TypeRef,
  ValueFormat,
  ValueSchema,
} from "@narratage/protocol";

export type { MediaArtifactRef } from "@narratage/media";

// Stylesheets are read to fill a form, never to decide what a component is.
export { parseSvs } from "@narratage/svs";
export type { SvsRecipe } from "@narratage/svs";
export { maskSourceHeader, parseSourceHeader } from "@narratage/source";

export { defaultFilmProgram, filmCanvasFromRecipe, filmRecipeKeys } from "@narratage/film";
