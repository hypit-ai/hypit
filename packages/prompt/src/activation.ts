import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";

import { promptAuthorDeclarations, promptComponent, promptManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(promptManifest), createGenerationModuleFacet(promptManifest),
    createProducerPackageFacet(promptComponent.producers ?? []),
    createRefinementPackageFacet(promptComponent.refinements ?? []),
    ...promptAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
  ],
};

export default hypitPackage;
