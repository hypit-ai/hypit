import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeSpeechEstimateSurface,
  estimateComponent,
  estimateManifest,
  estimateModuleRef,
  estimateSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/estimate",
  modules: [{ manifest: estimateManifest, specifiers: ["@narratage/estimate", "@narratage/estimate@1"] }],
  components: [estimateComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: estimateModuleRef,
    surface: "speech",
    mode: "structured",
    implementationDigest: estimateSurfaceImplementationDigest,
    handler: decodeSpeechEstimateSurface,
  })],
};

export default svmlPackage;
