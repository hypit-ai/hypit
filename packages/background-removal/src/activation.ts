import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  backgroundRemovalComponent, backgroundRemovalImplementationDigests, backgroundRemovalManifest,
  backgroundRemovalModuleRef, decodeBackgroundRemovalSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/background-removal",
  modules: [{ manifest: backgroundRemovalManifest, specifiers: ["@narratage/background-removal", "@narratage/background-removal@1"] }],
  components: [backgroundRemovalComponent],
  hostFacets: [{ ...createMarkupSurfaceHostFacet({
    module: backgroundRemovalModuleRef, surface: "background", mode: "structured",
    implementationDigest: backgroundRemovalImplementationDigests.surface, handler: decodeBackgroundRemovalSurface,
  }) }],
};
export default svmlPackage;
