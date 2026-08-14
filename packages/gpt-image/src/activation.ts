import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  gptImageCleanManifest,
  gptImageCleanModuleRef,
  gptImageComponent,
  gptImageManifest,
  gptImageMarkupSurfaces,
  gptImageModuleRef,
  gptImageCleanMarkupSurfaces,
} from "./index.js";
import {
  decodeCleanGptImageSurface,
  decodeGptImageSurface,
} from "./surface.js";
export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{
    manifest: gptImageManifest,
  }, {
    manifest: gptImageCleanManifest,
  }],
  components: [gptImageComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: gptImageModuleRef,
    declaration: gptImageMarkupSurfaces.find((item) => item.name === "image")!,
      handler: decodeGptImageSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: gptImageCleanModuleRef,
    declaration: gptImageCleanMarkupSurfaces.find((item) => item.name === "image")!,
      handler: decodeCleanGptImageSurface,
    }),
  ],
};
export default svmlPackage;
