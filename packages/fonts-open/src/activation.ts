import { createTextSurfaceHostFacet } from "@narratage/text";

import {
  decodeOpenFontFaceSurface,
  fontsOpenFaceSurfaceImplementationDigest,
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
  hostFacets: [createTextSurfaceHostFacet({
    module: fontsOpenModuleRef,
    surface: "face",
    mode: "structured",
    implementationDigest: fontsOpenFaceSurfaceImplementationDigest,
    handler: decodeOpenFontFaceSurface,
  })],
};

export default svmlPackage;
