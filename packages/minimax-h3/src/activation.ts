import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import { minimaxH3Component, minimaxH3Manifest, minimaxH3ModuleRef,
  minimaxH3MarkupSurfaces } from "./index.js";
import { decodeMinimaxFrameVideoSurface, decodeMinimaxReferenceVideoSurface, decodeMinimaxTextVideoSurface } from "./surface.js";
export const svmlPackage = { format: "svml.node-package@1" as const, modules: [{ manifest: minimaxH3Manifest }], components: [minimaxH3Component], hostFacets: [
  createMarkupSurfaceHostFacet({ module: minimaxH3ModuleRef,
    declaration: minimaxH3MarkupSurfaces.find((item) => item.name === "text-video")!, handler: decodeMinimaxTextVideoSurface }),
  createMarkupSurfaceHostFacet({ module: minimaxH3ModuleRef,
    declaration: minimaxH3MarkupSurfaces.find((item) => item.name === "frame-video")!, handler: decodeMinimaxFrameVideoSurface }),
  createMarkupSurfaceHostFacet({ module: minimaxH3ModuleRef,
    declaration: minimaxH3MarkupSurfaces.find((item) => item.name === "reference-video")!, handler: decodeMinimaxReferenceVideoSurface }),
] };
export default svmlPackage;
