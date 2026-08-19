import { createMarkupSurfaceHostFacet } from "@hypit/markup";
import {
  decodeHyperframesRenderSurface, renderHyperframesComponent, renderHyperframesManifest,
  renderHyperframesModuleRef,
  renderHyperframesMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: renderHyperframesManifest }],
  components: [renderHyperframesComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: renderHyperframesModuleRef,
    declaration: renderHyperframesMarkupSurfaces.find((item) => item.name === "video")!,
    handler: decodeHyperframesRenderSurface,
  })],
};
export default hypitPackage;
