import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeImageComposeSurface,
  imageComposeComponent,
  imageComposeManifest,
  imageComposeModuleRef,
  imageComposeMarkupSurfaces,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: imageComposeManifest }],
  components: [imageComposeComponent],
  hostFacets: [{ ...createMarkupSurfaceHostFacet({
    module: imageComposeModuleRef,
    declaration: imageComposeMarkupSurfaces.find((item) => item.name === "image")!, handler: decodeImageComposeSurface,
  }) }],
};

export default svmlPackage;
