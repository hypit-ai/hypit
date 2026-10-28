import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";

import { visualTreatmentAuthorDeclarations, visualTreatmentMarkupDeclarations } from "./declaration.js";
import { visualTreatmentManifest, visualTreatmentModuleRef } from "./manifest.js";
import { visualTreatmentStudioParameterCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualTreatmentManifest }],
  facets: [
    ...visualTreatmentAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...visualTreatmentMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: visualTreatmentModuleRef,
      declaration,
    })),
    createStudioCompanionFacet({ parameters: visualTreatmentStudioParameterCompanions }),
  ],
};
export default hypitPackage;
