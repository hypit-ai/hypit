import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeLinerankBoardSurface,
  decodeLinerankStyleSurface,
  linerankComponent,
  linerankManifest,
  linerankMarkupSurfaces,
  linerankModuleRef,
} from "./index.js";

const facets = [
  ["linerank-style", decodeLinerankStyleSurface],
  ["linerank", decodeLinerankBoardSurface],
] as const;

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: linerankManifest,
  }],
  components: [linerankComponent],
  hostFacets: facets.map(([surface, handler]) => createMarkupSurfaceHostFacet({
    module: linerankModuleRef,
    declaration: linerankMarkupSurfaces.find((item) => item.name === surface)!,
    handler,
  })),
};

export default hypitPackage;
