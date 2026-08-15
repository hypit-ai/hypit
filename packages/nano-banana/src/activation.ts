import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  nanoBananaComponent, nanoBananaManifest, nanoBananaModuleRef,
  nanoBananaMarkupSurfaces,
} from "./index.js";
import { decodeNanoBananaImageSurface, decodeNanoBananaProImageSurface } from "./surface.js";
export const narratagePackage = { format: "narratage.node-package@1" as const, modules: [{ manifest: nanoBananaManifest }], components: [nanoBananaComponent], hostFacets: [
  createMarkupSurfaceHostFacet({ module: nanoBananaModuleRef,
    declaration: nanoBananaMarkupSurfaces.find((item) => item.name === "image")!, handler: decodeNanoBananaImageSurface }),
  createMarkupSurfaceHostFacet({ module: nanoBananaModuleRef,
    declaration: nanoBananaMarkupSurfaces.find((item) => item.name === "pro-image")!, handler: decodeNanoBananaProImageSurface }),
] };
export default narratagePackage;
