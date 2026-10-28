import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { htmlVideoAuthorDeclarations, htmlVideoManifest, htmlVideoMarkupDeclarations, htmlVideoModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlVideoManifest }],
  facets: [
    ...htmlVideoAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...htmlVideoMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: htmlVideoModuleRef,
      declaration,
    })),
  ],
};
export default hypitPackage;
