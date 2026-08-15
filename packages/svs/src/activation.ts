import { createAuthorFrontendHostFacet } from "@narratage/elaborator";

import { svsFrontend, svsManifest } from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: svsManifest }],
  hostFacets: [createAuthorFrontendHostFacet(svsFrontend)],
};

export default narratagePackage;
