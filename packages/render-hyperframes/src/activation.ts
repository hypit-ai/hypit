import { createMarkupSurfaceHostFacet } from "@narratage/markup";
import {
  decodeHyperframesRenderSurface, renderHyperframesComponent, renderHyperframesManifest,
  renderHyperframesModuleRef,
  renderHyperframesMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: renderHyperframesManifest }],
  components: [renderHyperframesComponent],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: renderHyperframesModuleRef,
    declaration: renderHyperframesMarkupSurfaces.find((item) => item.name === "video")!,
    handler: decodeHyperframesRenderSurface,
  })],
};
export default narratagePackage;
