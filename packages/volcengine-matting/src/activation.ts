import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { volcengineMattingAuthorDeclarations, volcengineMattingDefinition, volcengineMattingMarkupDeclarations, volcengineMattingModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: volcengineMattingDefinition.manifest }],
  facets: [
    ...[volcengineMattingDefinition.component].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...volcengineMattingAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...volcengineMattingMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: volcengineMattingModuleRef, declaration })),
    ],
};
export default hypitPackage;
