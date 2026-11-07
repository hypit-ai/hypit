import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { scriptAuthorDeclaration, scriptManifest, scriptMarkupDeclaration, scriptModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: scriptManifest }],
  facets: [
    createAuthorDeclarationFacet(scriptAuthorDeclaration),
    createMarkupDeclarationFacet({
      module: scriptModuleRef,
      declaration: scriptMarkupDeclaration,
    }),
  ],
};

export default hypitPackage;
