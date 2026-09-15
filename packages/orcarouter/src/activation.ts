import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  orcaRouterComponent, orcaRouterManifest, orcaRouterMarkupSurfaces, orcaRouterModuleRef,
  decodeOrcaRouterGenerateSurface,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: orcaRouterManifest }],
  components: [orcaRouterComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: orcaRouterModuleRef,
    declaration: orcaRouterMarkupSurfaces.find((item) => item.name === "generate")!,
    handler: decodeOrcaRouterGenerateSurface,
  })],
};

export default hypitPackage;
