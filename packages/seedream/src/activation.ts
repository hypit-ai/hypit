import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import { seedreamComponent, seedreamDefinition, seedreamManifest, seedreamModuleRef,
  seedreamMarkupSurfaces } from "./index.js";
import { decodeSeedreamReferenceImageSurface, decodeSeedreamTextImageSurface } from "./surface.js";
export const hypitPackage = { format: "hypit.node-package@1" as const, modules: [{ manifest: seedreamManifest }], components: [seedreamComponent], hostFacets: [
  seedreamDefinition.hostFacet,
  createMarkupSurfaceHostFacet({ module: seedreamModuleRef,
    declaration: seedreamMarkupSurfaces.find((item) => item.name === "text-image")!, handler: decodeSeedreamTextImageSurface }),
  createMarkupSurfaceHostFacet({ module: seedreamModuleRef,
    declaration: seedreamMarkupSurfaces.find((item) => item.name === "reference-image")!, handler: decodeSeedreamReferenceImageSurface }),
] };
export default hypitPackage;
