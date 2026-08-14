import { createAuthorFrontendHostFacet } from "@narratage/elaborator";

import { svsFrontend, svsManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: svsManifest }],
  hostFacets: [createAuthorFrontendHostFacet(svsFrontend)],
};

export default svmlPackage;
