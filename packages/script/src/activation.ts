import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptMarkupSurfaces,
} from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: scriptManifest }],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: scriptModuleRef,
    declaration: scriptMarkupSurfaces.find((item) => item.name === "script")!,
    handler: decodeScriptSurface,
  })],
};

export default svmlPackage;
