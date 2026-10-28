import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { grokImagineComponent, grokImagineManifest, grokImagineModuleRef } from "./index.js";
import { grokImagineAuthorDeclarations, grokImagineMarkupDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: grokImagineManifest }],
  facets: [
    ...[grokImagineComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...grokImagineAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...grokImagineMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: grokImagineModuleRef, declaration })),

  ],
};
export default hypitPackage;
