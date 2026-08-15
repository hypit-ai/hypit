import { createRunFrontendHostFacet } from "@narratage/run";

import { runMarkupFrontend } from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [createRunFrontendHostFacet(runMarkupFrontend)],
};

export default narratagePackage;
