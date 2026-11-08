import { createAuthorFrontendFacet } from "@hypit/author";

import { documentFrontend } from "./frontend.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  facets: [createAuthorFrontendFacet(documentFrontend)],
};

export default hypitPackage;
