import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  pixverseComponent, pixverseDefinition, pixverseManifest, pixverseModuleRef, pixverseMarkupSurfaces,
} from "./index.js";
import { decodePixverseReferenceVideoSurface, decodePixverseVideoSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: pixverseManifest }], facets: [
  createProducerPackageFacet(pixverseComponent.producers ?? []),
  createRefinementPackageFacet(pixverseComponent.refinements ?? []),
  createMarkupSurfaceFacet({ module: pixverseModuleRef,
    declaration: pixverseMarkupSurfaces.find((item) => item.name === "video")!, handler: decodePixverseVideoSurface }),
  createMarkupSurfaceFacet({ module: pixverseModuleRef,
    declaration: pixverseMarkupSurfaces.find((item) => item.name === "reference-video")!, handler: decodePixverseReferenceVideoSurface }),
] };
export default hypitPackage;
