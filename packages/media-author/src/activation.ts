import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createAuthorDeclarationFacet } from "@hypit/generation-authoring/author";

import { mediaAuthorDeclarations, mediaAuthorManifest } from "./index.js";

export const hypitPackage = {
  facets: [createModuleFacet(mediaAuthorManifest), createGenerationModuleFacet(mediaAuthorManifest), ...mediaAuthorDeclarations.map(createAuthorDeclarationFacet)],
};

export default hypitPackage;
