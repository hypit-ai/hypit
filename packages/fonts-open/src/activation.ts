import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeOpenFontFaceSurface,
  decodeOpenFontStackSurface,
  fontsOpenManifest,
  fontsOpenModuleRef,
  fontsOpenMarkupSurfaces,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{
    manifest: fontsOpenManifest,
  }],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: fontsOpenModuleRef,
    declaration: fontsOpenMarkupSurfaces.find((item) => item.name === "face")!,
      handler: decodeOpenFontFaceSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: fontsOpenModuleRef,
    declaration: fontsOpenMarkupSurfaces.find((item) => item.name === "stack")!,
      handler: decodeOpenFontStackSurface,
    }),
  ],
};

export default svmlPackage;
