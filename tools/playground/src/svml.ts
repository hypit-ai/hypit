/**
 * The browser-safe surface of the compiler, in one place.
 *
 * HyperFrames keeps its browser-safe compiler at the package root and its
 * Node-only project staging behind `@narratage/hyperframes/project`. The
 * document module is imported directly here so that boundary stays visible.
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

export { defaultCanvasSpace } from "@narratage/spatial";

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
