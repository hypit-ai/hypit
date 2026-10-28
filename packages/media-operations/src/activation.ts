import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { mediaOperationsAuthorDeclarations, mediaOperationsComponent, mediaOperationsManifest, mediaOperationsMarkupDeclarations, mediaOperationsModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaOperationsManifest }],
  facets: [
    ...[mediaOperationsComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...mediaOperationsAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...mediaOperationsMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: mediaOperationsModuleRef,
      declaration,
    })),


  ],
};
export default hypitPackage;
