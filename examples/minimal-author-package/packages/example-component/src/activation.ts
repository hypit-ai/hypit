import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { exampleAuthorDeclarations, exampleComponent, exampleManifest, exampleMarkupDeclarations, exampleModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: exampleManifest }],
  facets: [
    createProducerPackageFacet(exampleComponent.producers ?? []),
    createRefinementPackageFacet(exampleComponent.refinements ?? []),
    ...exampleAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...exampleMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({ module: exampleModuleRef, declaration })),
  ],
};
export default hypitPackage;
