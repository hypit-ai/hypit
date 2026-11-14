import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createAuthorFrontendFacet } from "@hypit/generation-authoring/author";

import { recipeFrontend, recipeManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(recipeManifest), createGenerationModuleFacet(recipeManifest),createAuthorFrontendFacet(recipeFrontend)],
};

export default hypitPackage;
