import { createMarkupSurfaceHostFacet } from "@hypit/markup";

import {
  decodeMediaAudioSurface, decodeMediaFontSurface, decodeMediaImageSurface, mediaComponent,
  mediaManifest,
  mediaModuleRef,
  mediaMarkupSurfaces,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: mediaManifest }],
  components: [mediaComponent],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: mediaModuleRef,
    declaration: mediaMarkupSurfaces.find((item) => item.name === "image")!,
      handler: decodeMediaImageSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: mediaModuleRef,
    declaration: mediaMarkupSurfaces.find((item) => item.name === "audio")!,
      handler: decodeMediaAudioSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: mediaModuleRef,
    declaration: mediaMarkupSurfaces.find((item) => item.name === "font")!,
      handler: decodeMediaFontSurface,
    }),
  ],
};

export default hypitPackage;
