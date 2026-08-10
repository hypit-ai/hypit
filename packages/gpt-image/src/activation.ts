import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  gptImageCleanManifest,
  gptImageCleanModuleRef,
  gptImageComponent,
  gptImageManifest,
  gptImageModuleRef,
  gptImageSurfaceImplementationDigests,
} from "./index.js";
import {
  decodeCleanGptImageSurface,
  decodeGptImageSurface,
} from "./surface.js";
export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/gpt-image",
  modules: [{
    manifest: gptImageManifest,
    specifiers: ["@narratage/gpt-image", "@narratage/gpt-image@1"],
  }, {
    manifest: gptImageCleanManifest,
    specifiers: ["@narratage/gpt-image/clean", "@narratage/gpt-image/clean@1"],
  }],
  components: [gptImageComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: gptImageModuleRef,
      surface: "image",
      mode: "structured",
      implementationDigest: gptImageSurfaceImplementationDigests.image,
      handler: decodeGptImageSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: gptImageCleanModuleRef,
      surface: "image",
      mode: "structured",
      implementationDigest: gptImageSurfaceImplementationDigests.cleanImage,
      handler: decodeCleanGptImageSurface,
    }),
  ],
};
export default svmlPackage;
