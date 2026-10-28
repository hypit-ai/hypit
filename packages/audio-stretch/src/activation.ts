import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";

import { audioStretchAuthorDeclarations, audioStretchMarkupDeclarations } from "./declaration.js";
import { audioStretchManifest, audioStretchModuleRef } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audioStretchManifest }],
  facets: [
    ...audioStretchAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...audioStretchMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: audioStretchModuleRef,
      declaration,
    })),
  ],
};

export default hypitPackage;
