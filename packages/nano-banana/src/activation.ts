import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import {
  nanoBananaComponent, nanoBananaDefinition, nanoBananaManifest, nanoBananaModuleRef,
  nanoBananaMarkupSurfaces,
} from "./index.js";
import { decodeNanoBananaImageSurface, decodeNanoBananaProImageSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: nanoBananaManifest }], facets: [
  createProducerPackageFacet(nanoBananaComponent),
  createRefinementPackageFacet(nanoBananaComponent),
  createMarkupSurfaceFacet({ module: nanoBananaModuleRef,
    declaration: nanoBananaMarkupSurfaces.find((item) => item.name === "image")!, handler: decodeNanoBananaImageSurface }),
  createMarkupSurfaceFacet({ module: nanoBananaModuleRef,
    declaration: nanoBananaMarkupSurfaces.find((item) => item.name === "pro-image")!, handler: decodeNanoBananaProImageSurface }),
] };
export default hypitPackage;
