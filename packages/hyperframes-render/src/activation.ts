import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeHyperframesRenderSurface, hyperframesRenderComponent, hyperframesRenderManifest,
  hyperframesRenderModuleRef, hyperframesRenderSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/hyperframes-render",
  modules: [{ manifest: hyperframesRenderManifest, specifiers: ["@narratage/hyperframes-render", "@narratage/hyperframes-render@1"] }],
  components: [hyperframesRenderComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: hyperframesRenderModuleRef, surface: "video", mode: "structured",
    implementationDigest: hyperframesRenderSurfaceImplementationDigest,
    handler: decodeHyperframesRenderSurface,
  })],
};
export default svmlPackage;
