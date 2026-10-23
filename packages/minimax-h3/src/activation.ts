import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { minimaxH3Component, minimaxH3Definition, minimaxH3Manifest, minimaxH3ModuleRef,
  minimaxH3MarkupSurfaces } from "./index.js";
import { decodeMinimaxFrameVideoSurface, decodeMinimaxReferenceVideoSurface, decodeMinimaxTextVideoSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: minimaxH3Manifest }], facets: [
  createProducerPackageFacet(minimaxH3Component.producers ?? []),
  createRefinementPackageFacet(minimaxH3Component.refinements ?? []),
  createMarkupSurfaceFacet({ module: minimaxH3ModuleRef,
    declaration: minimaxH3MarkupSurfaces.find((item) => item.name === "text-video")!, handler: decodeMinimaxTextVideoSurface }),
  createMarkupSurfaceFacet({ module: minimaxH3ModuleRef,
    declaration: minimaxH3MarkupSurfaces.find((item) => item.name === "frame-video")!, handler: decodeMinimaxFrameVideoSurface }),
  createMarkupSurfaceFacet({ module: minimaxH3ModuleRef,
    declaration: minimaxH3MarkupSurfaces.find((item) => item.name === "reference-video")!, handler: decodeMinimaxReferenceVideoSurface }),
] };
export default hypitPackage;
