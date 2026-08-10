import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeMediaAudioSurface, decodeMediaFontSurface, decodeMediaImageSurface, mediaComponent,
  mediaManifest,
  mediaModuleRef,
  mediaSurfaceImplementationDigests,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/media",
  modules: [{ manifest: mediaManifest, specifiers: ["@narratage/media", "@narratage/media@1"] }],
  components: [mediaComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: mediaModuleRef,
      surface: "image",
      mode: "structured",
      implementationDigest: mediaSurfaceImplementationDigests.image,
      handler: decodeMediaImageSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: mediaModuleRef,
      surface: "audio",
      mode: "structured",
      implementationDigest: mediaSurfaceImplementationDigests.audio,
      handler: decodeMediaAudioSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: mediaModuleRef,
      surface: "font",
      mode: "structured",
      implementationDigest: mediaSurfaceImplementationDigests.font,
      handler: decodeMediaFontSurface,
    }),
  ],
};

export default svmlPackage;
