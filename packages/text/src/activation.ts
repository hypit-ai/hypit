import { createRefinementPackageFacet } from "@hypit/refinement";
import { createProducerPackageFacet } from "@hypit/producer";
import { createAuthorDeclarationFacet, createAuthorFrontendFacet } from "@hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/markup";
import { textComponent, textAuthorDeclarations, textManifest, textMarkupDeclarations, textModuleRef, textRecipeFrontend } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: textManifest }],
  facets: [
    ...[textComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    createAuthorFrontendFacet(textRecipeFrontend),
    ...textAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...textMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: textModuleRef,
      declaration,
    })),

  ],
};

export default hypitPackage;
