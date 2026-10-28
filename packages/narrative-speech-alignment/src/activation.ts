import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { speechAlignmentAuthorDeclarations, speechAlignmentComponent, speechAlignmentManifest, speechAlignmentMarkupDeclarations, speechAlignmentModuleRef } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechAlignmentManifest }],
  facets: [
    createProducerPackageFacet(speechAlignmentComponent.producers),
    ...speechAlignmentAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...speechAlignmentMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: speechAlignmentModuleRef,
      declaration,
    })),
  ],
};
export default hypitPackage;
