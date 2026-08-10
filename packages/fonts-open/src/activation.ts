import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeOpenFontFaceSurface,
  decodeOpenFontStackSurface,
  fontsOpenFaceSurfaceImplementationDigest,
  fontsOpenStackSurfaceImplementationDigest,
  fontsOpenManifest,
  fontsOpenModuleRef,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/fonts-open",
  modules: [{
    manifest: fontsOpenManifest,
    specifiers: ["@narratage/fonts-open", "@narratage/fonts-open@1"],
  }],
  hostFacets: [
    createMarkupSurfaceHostFacet({
      module: fontsOpenModuleRef,
      surface: "face",
      mode: "structured",
      implementationDigest: fontsOpenFaceSurfaceImplementationDigest,
      handler: decodeOpenFontFaceSurface,
    }),
    createMarkupSurfaceHostFacet({
      module: fontsOpenModuleRef,
      surface: "stack",
      mode: "structured",
      implementationDigest: fontsOpenStackSurfaceImplementationDigest,
      handler: decodeOpenFontStackSurface,
    }),
  ],
};

export default svmlPackage;
