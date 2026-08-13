import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  captionFineComponent,
  captionFineManifest,
  captionFineModuleRef,
  decodeFineCaptionStyleSurface,
  decodeFineCaptionTrackSurface,
  captionFineMarkupSurfaces,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{
    manifest: captionFineManifest,
  }],
  components: [captionFineComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: captionFineModuleRef,
    declaration: captionFineMarkupSurfaces.find((item) => item.name === "style")!,
      handler: decodeFineCaptionStyleSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: captionFineModuleRef,
    declaration: captionFineMarkupSurfaces.find((item) => item.name === "track")!,
      handler: decodeFineCaptionTrackSurface,
    }),
  ],
};

export default svmlPackage;
