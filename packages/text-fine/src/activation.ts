import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { textFineAuthorDeclarations, textFineComponent, textFineManifest, textFineMarkupDeclarations, textFineModuleRef } from "./index.js";
import { textFineStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: textFineManifest }],
  facets: [
    createProducerPackageFacet(textFineComponent.producers),
    ...textFineAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...textFineMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: textFineModuleRef,
      declaration,
    })),



    createStudioCompanionFacet({ tracks: textFineStudioTrackCompanions }),
  ],
};
export default hypitPackage;
