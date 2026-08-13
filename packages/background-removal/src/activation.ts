import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  backgroundRemovalComponent, backgroundRemovalManifest,
  backgroundRemovalModuleRef, decodeBackgroundRemovalSurface,
  backgroundRemovalMarkupSurfaces,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: backgroundRemovalManifest }],
  components: [backgroundRemovalComponent],
  hostFacets: [{ ...createMarkupSurfaceHostFacet({
    module: backgroundRemovalModuleRef,
    declaration: backgroundRemovalMarkupSurfaces.find((item) => item.name === "background")!, handler: decodeBackgroundRemovalSurface,
  }) }],
};
export default svmlPackage;
