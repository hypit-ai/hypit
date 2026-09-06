import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import { portraitMattingSurface, volcengineMattingDefinition, volcengineMattingModuleRef } from "./index.js";
import { decodePortraitMattingSurface } from "./surface.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: volcengineMattingDefinition.manifest }],
  components: [volcengineMattingDefinition.component],
  hostFacets: [volcengineMattingDefinition.hostFacet, createMarkupSurfaceHostFacet({
    module: volcengineMattingModuleRef, declaration: portraitMattingSurface, handler: decodePortraitMattingSurface,
  })],
};
export default hypitPackage;
