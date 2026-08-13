import { createRunFrontendHostFacet } from "@narratage/run";

import { runMarkupFrontend } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  hostFacets: [createRunFrontendHostFacet(runMarkupFrontend)],
};

export default svmlPackage;
