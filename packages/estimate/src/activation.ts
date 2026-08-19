import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeSpeechEstimateSurface,
  estimateComponent,
  estimateManifest,
  estimateModuleRef,
  estimateMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: estimateManifest }],
  components: [estimateComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: estimateModuleRef,
    declaration: estimateMarkupSurfaces.find((item) => item.name === "speech")!,
    handler: decodeSpeechEstimateSurface,
  })],
};

export default hypitPackage;
