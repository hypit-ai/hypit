import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { seedanceComponent, seedanceManifest, seedanceModuleRef } from "./index.js";
import { seedanceAuthorDeclarations, seedanceMarkupDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: seedanceManifest }],
  facets: [
    ...[seedanceComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...seedanceAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...seedanceMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: seedanceModuleRef, declaration })),

  ],
};

export default hypitPackage;
