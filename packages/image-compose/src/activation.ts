import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeImageComposeSurface,
  imageComposeComponent,
  imageComposeImplementationDigests,
  imageComposeManifest,
  imageComposeModuleRef,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/image-compose",
  modules: [{ manifest: imageComposeManifest, specifiers: ["@narratage/image-compose", "@narratage/image-compose@1"] }],
  components: [imageComposeComponent],
  hostFacets: [{ ...createMarkupSurfaceHostFacet({
    module: imageComposeModuleRef, surface: "image", mode: "structured",
    implementationDigest: imageComposeImplementationDigests.surface, handler: decodeImageComposeSurface,
  }) }],
};

export default svmlPackage;
