import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";

import {
  realizationAuthorDeclarations,
  realizationMarkupDeclarations,
} from "./declaration.js";
import { realizationManifest, realizationModuleRef } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: realizationManifest }],
  facets: [
    ...realizationAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...realizationMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: realizationModuleRef,
      declaration,
    })),
  ],
};

export default hypitPackage;
