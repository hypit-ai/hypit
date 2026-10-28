import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { narrativeTemporalComponent, narrativeTemporalAuthorDeclarations, narrativeTemporalManifest, narrativeTemporalMarkupDeclarations, narrativeTemporalModuleRef } from "./index.js";
import { narrativeStudioTemporalDeclarations, narrativeStudioTemporalRelations } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: narrativeTemporalManifest }],
  facets: [
    createStudioCompanionFacet({
      temporalDeclarations: narrativeStudioTemporalDeclarations,
      temporalRelations: narrativeStudioTemporalRelations,
    }),
    ...[narrativeTemporalComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...narrativeTemporalAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...narrativeTemporalMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: narrativeTemporalModuleRef,
      declaration,
    })),

  ],
};
export default hypitPackage;
