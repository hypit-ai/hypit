import { createTextSurfaceHostFacet } from "@narratage/text";

import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/script",
  modules: [{ manifest: scriptManifest, specifiers: ["@narratage/script", "@narratage/script@1"] }],
  hostFacets: [createTextSurfaceHostFacet({
    module: scriptModuleRef,
    surface: "script",
    mode: "raw",
    implementationDigest: scriptSurfaceImplementationDigest,
    handler: decodeScriptSurface,
  })],
};

export default svmlPackage;
