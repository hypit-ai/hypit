import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeDepthStackLabelSurface,
  decodeDepthStackSurface,
  depthStackComponent,
  depthStackManifest,
  depthStackModuleRef,
  depthStackMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
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

export default narratagePackage;
