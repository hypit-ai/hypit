import { createTextSurfaceHostFacet } from "@narratage/text";

import {
  decodeMediaAudioSurface, decodeMediaImageSurface, mediaComponent,
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
    createTextSurfaceHostFacet({
      module: mediaModuleRef,
      surface: "image",
      mode: "structured",
      implementationDigest: mediaSurfaceImplementationDigests.image,
      handler: decodeMediaImageSurface,
    }),
    createTextSurfaceHostFacet({
      module: mediaModuleRef,
      surface: "audio",
      mode: "structured",
      implementationDigest: mediaSurfaceImplementationDigests.audio,
      handler: decodeMediaAudioSurface,
    }),
  ],
};

export default svmlPackage;
