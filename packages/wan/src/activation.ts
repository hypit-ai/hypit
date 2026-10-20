import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { wanComponent, wanDefinition, wanManifest, wanModuleRef, wanMarkupSurfaces } from "./index.js";
import { decodeWanImageSurface, decodeWanProImageSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: wanManifest }], facets: [
  createProducerPackageFacet(wanComponent),
  createRefinementPackageFacet(wanComponent),
  createMarkupSurfaceFacet({ module: wanModuleRef,
    declaration: wanMarkupSurfaces.find((item) => item.name === "image")!, handler: decodeWanImageSurface }),
  createMarkupSurfaceFacet({ module: wanModuleRef,
    declaration: wanMarkupSurfaces.find((item) => item.name === "pro-image")!, handler: decodeWanProImageSurface }),
] };
export default hypitPackage;
