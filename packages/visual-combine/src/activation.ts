import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { visualCombineComponent } from "./component.js";
import { visualCombineAuthorDeclarations, visualCombineMarkupDeclarations } from "./declaration.js";
import { visualCombineManifest, visualCombineModuleRef } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualCombineManifest }],
  facets: [
    createProducerPackageFacet(visualCombineComponent.producers),
    createRefinementPackageFacet(visualCombineComponent.refinements),
    ...visualCombineAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...visualCombineMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: visualCombineModuleRef,
      declaration,
    })),
  ],
};
export default hypitPackage;
