import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import { decodeClockSurface, decodeSpaceSurface } from "./surface.js";
import { programSpaceManifest, programSpaceMarkupSurfaces, programSpaceModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: programSpaceManifest }],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: programSpaceModuleRef,
    declaration: programSpaceMarkupSurfaces.find((item) => item.name === "clock")!,
    handler: decodeClockSurface,
  }), createMarkupSurfaceHostFacet({
    module: programSpaceModuleRef,
    declaration: programSpaceMarkupSurfaces.find((item) => item.name === "space")!,
    handler: decodeSpaceSurface,
  })],
};
export default hypitPackage;
