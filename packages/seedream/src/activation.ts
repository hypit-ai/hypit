import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { seedreamComponent, seedreamDefinition, seedreamManifest, seedreamModuleRef,
  seedreamMarkupSurfaces } from "./index.js";
import { decodeSeedreamReferenceImageSurface, decodeSeedreamTextImageSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: seedreamManifest }], facets: [
  createProducerPackageFacet(seedreamComponent),
  createRefinementPackageFacet(seedreamComponent),
  createMarkupSurfaceFacet({ module: seedreamModuleRef,
    declaration: seedreamMarkupSurfaces.find((item) => item.name === "text-image")!, handler: decodeSeedreamTextImageSurface }),
  createMarkupSurfaceFacet({ module: seedreamModuleRef,
    declaration: seedreamMarkupSurfaces.find((item) => item.name === "reference-image")!, handler: decodeSeedreamReferenceImageSurface }),
] };
export default hypitPackage;
