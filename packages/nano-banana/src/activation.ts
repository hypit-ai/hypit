import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  nanoBananaComponent, nanoBananaDefinition, nanoBananaManifest, nanoBananaModuleRef,
  nanoBananaMarkupSurfaces,
} from "./index.js";
import { decodeNanoBananaImageSurface, decodeNanoBananaProImageSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.node-package@1" as const, modules: [{ manifest: nanoBananaManifest }], components: [nanoBananaComponent], hostFacets: [
  nanoBananaDefinition.hostFacet,
  createMarkupSurfaceHostFacet({ module: nanoBananaModuleRef,
    declaration: nanoBananaMarkupSurfaces.find((item) => item.name === "image")!, handler: decodeNanoBananaImageSurface }),
  createMarkupSurfaceHostFacet({ module: nanoBananaModuleRef,
    declaration: nanoBananaMarkupSurfaces.find((item) => item.name === "pro-image")!, handler: decodeNanoBananaProImageSurface }),
] };
export default hypitPackage;
