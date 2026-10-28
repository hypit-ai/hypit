import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { filmComponent, filmManifest, filmModuleRef, filmAuthorDeclarations, filmMarkupDeclarations } from "./index.js";
import { filmStudioCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: filmManifest }],
  facets: [
    createProducerPackageFacet(filmComponent.producers),
    createRefinementPackageFacet(filmComponent.refinements ?? []),
    ...filmAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...filmMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: filmModuleRef,
      declaration,
    })),
    createStudioCompanionFacet({ films: filmStudioCompanions }),
  ],
};
export default hypitPackage;
