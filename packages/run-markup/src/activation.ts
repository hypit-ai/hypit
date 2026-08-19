import { createRunFrontendHostFacet } from "@hypit/run";

import { runMarkupFrontend } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [createRunFrontendHostFacet(runMarkupFrontend)],
};

export default hypitPackage;
