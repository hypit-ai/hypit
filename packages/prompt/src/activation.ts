import { createAuthorDeclarationFacet } from "@hypit/author";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { promptAuthorDeclarations, promptComponent, promptManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: promptManifest }],
  facets: [
    createProducerPackageFacet(promptComponent.producers ?? []),
    createRefinementPackageFacet(promptComponent.refinements ?? []),
    ...promptAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
  ],
};

export default hypitPackage;
