import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";

import { visualMatteAuthorDeclarations, visualMatteMarkupDeclarations } from "./declaration.js";
import { visualMatteManifest, visualMatteModuleRef } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualMatteManifest }],
  facets: [
    ...visualMatteAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...visualMatteMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: visualMatteModuleRef,
      declaration,
    })),
  ],
};

export default hypitPackage;
