import { createMarkupSurfaceHostFacet } from "@narratage/markup";

import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptMarkupSurfaces,
} from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: scriptManifest }],
  hostFacets: [createMarkupSurfaceHostFacet({
    module: scriptModuleRef,
    declaration: scriptMarkupSurfaces.find((item) => item.name === "script")!,
    handler: decodeScriptSurface,
  })],
};

export default narratagePackage;
