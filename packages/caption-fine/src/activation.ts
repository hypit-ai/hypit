import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  captionFineComponent,
  captionFineManifest,
  captionFineModuleRef,
  captionFineStyleSurfaceImplementationDigest,
  captionFineTrackSurfaceImplementationDigest,
  decodeFineCaptionStyleSurface,
  decodeFineCaptionTrackSurface,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/caption-fine",
  modules: [{
    manifest: captionFineManifest,
    specifiers: ["@narratage/caption-fine", "@narratage/caption-fine@1"],
  }],
  components: [captionFineComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: captionFineModuleRef,
      surface: "style",
      mode: "structured",
      implementationDigest: captionFineStyleSurfaceImplementationDigest,
      handler: decodeFineCaptionStyleSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: captionFineModuleRef,
      surface: "track",
      mode: "structured",
      implementationDigest: captionFineTrackSurfaceImplementationDigest,
      handler: decodeFineCaptionTrackSurface,
    }),
  ],
};

export default svmlPackage;
