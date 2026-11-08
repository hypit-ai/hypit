import { createAuthorDeclarationFacet } from "@hypit/author";

import { mediaAuthorDeclarations, mediaAuthorManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaAuthorManifest }],
  facets: mediaAuthorDeclarations.map(createAuthorDeclarationFacet),
};

export default hypitPackage;
