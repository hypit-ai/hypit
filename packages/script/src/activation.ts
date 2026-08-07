import { createTextSurfaceHostFacet } from "@svml/text";

import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/script",
  modules: [{ manifest: scriptManifest, specifiers: ["@svml/script", "@svml/script@1"] }],
  hostFacets: [createTextSurfaceHostFacet({
    module: scriptModuleRef,
    surface: "script",
    mode: "raw",
    implementationDigest: scriptSurfaceImplementationDigest,
    handler: decodeScriptSurface,
  })],
};

export default svmlPackage;
