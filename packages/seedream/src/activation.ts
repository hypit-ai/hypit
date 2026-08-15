import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import { seedreamComponent, seedreamManifest, seedreamModuleRef,
  seedreamMarkupSurfaces } from "./index.js";
import { decodeSeedreamReferenceImageSurface, decodeSeedreamTextImageSurface } from "./surface.js";
export const narratagePackage = { format: "narratage.node-package@1" as const, modules: [{ manifest: seedreamManifest }], components: [seedreamComponent], hostFacets: [
  createMarkupSurfaceHostFacet({ module: seedreamModuleRef,
    declaration: seedreamMarkupSurfaces.find((item) => item.name === "text-image")!, handler: decodeSeedreamTextImageSurface }),
  createMarkupSurfaceHostFacet({ module: seedreamModuleRef,
    declaration: seedreamMarkupSurfaces.find((item) => item.name === "reference-image")!, handler: decodeSeedreamReferenceImageSurface }),
] };
export default narratagePackage;
