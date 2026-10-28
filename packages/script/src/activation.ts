import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { scriptAuthorDeclaration, scriptManifest, scriptMarkupDeclaration, scriptModuleRef } from "./index.js";
import { scriptStudioTemporalDomains } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: scriptManifest }],
  facets: [
    createAuthorDeclarationFacet(scriptAuthorDeclaration),
    createMarkupDeclarationFacet({
      module: scriptModuleRef,
      declaration: scriptMarkupDeclaration,
    }),
    createStudioCompanionFacet({ temporalDomains: scriptStudioTemporalDomains }),
  ],
};

export default hypitPackage;
