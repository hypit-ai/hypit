import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";

import { visualTransitionAuthorDeclarations, visualTransitionMarkupDeclarations } from "./declaration.js";
import { visualTransitionManifest, visualTransitionModuleRef } from "./manifest.js";
import { visualTransitionStudioParameterCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualTransitionManifest }],
  facets: [
    ...visualTransitionAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...visualTransitionMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: visualTransitionModuleRef,
      declaration,
    })),
    createStudioCompanionFacet({ parameters: visualTransitionStudioParameterCompanions }),
  ],
};
export default hypitPackage;
