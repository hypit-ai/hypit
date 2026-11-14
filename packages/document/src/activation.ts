import { createAuthorFrontendFacet } from "@hypit/generation-authoring/author";

import { documentFrontend } from "./frontend.js";

export const hypitPackage = {
  facets: [createAuthorFrontendFacet(documentFrontend)],
};

export default hypitPackage;
