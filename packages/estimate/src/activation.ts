import { createTextSurfaceHostFacet } from "@svml/text";

import {
  decodeSpeechEstimateSurface,
  estimateComponent,
  estimateManifest,
  estimateModuleRef,
  estimateSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/estimate",
  modules: [{ manifest: estimateManifest, specifiers: ["@svml/estimate", "@svml/estimate@1"] }],
  components: [estimateComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: estimateModuleRef,
    surface: "speech",
    mode: "structured",
    implementationDigest: estimateSurfaceImplementationDigest,
    handler: decodeSpeechEstimateSurface,
  })],
};

export default svmlPackage;
