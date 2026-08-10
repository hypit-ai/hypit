import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import { minimaxH3Component, minimaxH3Manifest, minimaxH3ModuleRef, minimaxH3SurfaceImplementationDigests } from "./index.js";
import { decodeMinimaxFrameVideoSurface, decodeMinimaxReferenceVideoSurface, decodeMinimaxTextVideoSurface } from "./surface.js";
export const svmlPackage = { format: "svml.node-package@1" as const, name: "@narratage/minimax-h3", modules: [{ manifest: minimaxH3Manifest, specifiers: ["@narratage/minimax-h3", "@narratage/minimax-h3@1"] }], components: [minimaxH3Component], hostFacets: [
  createMarkupSurfaceHostFacet({ module: minimaxH3ModuleRef, surface: "text-video", mode: "structured", implementationDigest: minimaxH3SurfaceImplementationDigests.textVideo, handler: decodeMinimaxTextVideoSurface }),
  createMarkupSurfaceHostFacet({ module: minimaxH3ModuleRef, surface: "frame-video", mode: "structured", implementationDigest: minimaxH3SurfaceImplementationDigests.frameVideo, handler: decodeMinimaxFrameVideoSurface }),
  createMarkupSurfaceHostFacet({ module: minimaxH3ModuleRef, surface: "reference-video", mode: "structured", implementationDigest: minimaxH3SurfaceImplementationDigests.referenceVideo, handler: decodeMinimaxReferenceVideoSurface }),
] };
export default svmlPackage;
