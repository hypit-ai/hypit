import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  gptImageCleanManifest,
  gptImageCleanModuleRef,
  gptImageComponent,
  gptImageDefinition,
  gptImageManifest,
  gptImageMarkupSurfaces,
  gptImageModuleRef,
  gptImageCleanMarkupSurfaces,
} from "./index.js";
import {
  decodeCleanGptImageSurface,
  decodeGptImageSurface,
} from "./surface.js";
export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: gptImageManifest,
  }, {
    manifest: gptImageCleanManifest,
  }],
  components: [gptImageComponent],
  hostFacets: [
    gptImageDefinition.hostFacet,
    ...(gptImageDefinition.runFragmentFacet === undefined ? [] : [gptImageDefinition.runFragmentFacet]),
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
export default hypitPackage;
