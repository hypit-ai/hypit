import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeDepthStackLabelSurface,
  decodeDepthStackSurface,
  depthStackComponent,
  depthStackManifest,
  depthStackModuleRef,
  depthStackMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{
    manifest: depthStackManifest,
  }],
  components: [depthStackComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: depthStackModuleRef,
    declaration: depthStackMarkupSurfaces.find((item) => item.name === "label")!,
      handler: decodeDepthStackLabelSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: depthStackModuleRef,
    declaration: depthStackMarkupSurfaces.find((item) => item.name === "track")!,
      handler: decodeDepthStackSurface,
    }),
  ],
};

export default hypitPackage;
