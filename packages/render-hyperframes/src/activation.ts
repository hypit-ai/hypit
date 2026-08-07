import { createTextSurfaceHostFacet } from "@narratage/text";
import {
  decodeHyperframesRenderSurface, renderHyperframesComponent, renderHyperframesManifest,
  renderHyperframesModuleRef, renderHyperframesSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/render-hyperframes",
  modules: [{ manifest: renderHyperframesManifest, specifiers: ["@narratage/render-hyperframes", "@narratage/render-hyperframes@1"] }],
  components: [renderHyperframesComponent],
  hostFacets: [createTextSurfaceHostFacet({
    module: renderHyperframesModuleRef, surface: "video", mode: "structured",
    implementationDigest: renderHyperframesSurfaceImplementationDigest,
    handler: decodeHyperframesRenderSurface,
  })],
};
export default svmlPackage;
