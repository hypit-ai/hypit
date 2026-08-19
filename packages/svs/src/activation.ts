import { createAuthorFrontendHostFacet } from "@hypit/elaborator";

import { svsFrontend, svsManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: svsManifest }],
  hostFacets: [createAuthorFrontendHostFacet(svsFrontend)],
};

export default hypitPackage;
