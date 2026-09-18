import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import { wanComponent, wanDefinition, wanManifest, wanModuleRef, wanMarkupSurfaces } from "./index.js";
import { decodeWanImageSurface, decodeWanProImageSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.node-package@1" as const, modules: [{ manifest: wanManifest }], components: [wanComponent], hostFacets: [
  wanDefinition.hostFacet,
  createMarkupSurfaceHostFacet({ module: wanModuleRef,
    declaration: wanMarkupSurfaces.find((item) => item.name === "image")!, handler: decodeWanImageSurface }),
  createMarkupSurfaceHostFacet({ module: wanModuleRef,
    declaration: wanMarkupSurfaces.find((item) => item.name === "pro-image")!, handler: decodeWanProImageSurface }),
] };
export default hypitPackage;
