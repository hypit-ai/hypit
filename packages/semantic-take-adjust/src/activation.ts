import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeSemanticTakeAdjustSurface,
  semanticTakeAdjustComponent,
  semanticTakeAdjustManifest,
  semanticTakeAdjustMarkupSurfaces,
  semanticTakeAdjustModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: semanticTakeAdjustManifest }],
  components: [semanticTakeAdjustComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: semanticTakeAdjustModuleRef,
    declaration: semanticTakeAdjustMarkupSurfaces.find((item) => item.name === "semantic-take")!,
    handler: decodeSemanticTakeAdjustSurface,
  })],
};

export default hypitPackage;
