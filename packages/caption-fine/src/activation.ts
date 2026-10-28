import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { captionFineComponent, captionFineAuthorDeclarations, captionFineManifest, captionFineMarkupDeclarations, captionFineModuleRef } from "./index.js";
import { captionFineStudioParameterCompanions, captionFineStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: captionFineManifest,
  }],
  facets: [
    createProducerPackageFacet(captionFineComponent.producers),
    ...captionFineAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...captionFineMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: captionFineModuleRef,
      declaration,
    })),

    createStudioCompanionFacet({
      tracks: captionFineStudioTrackCompanions,
      parameters: captionFineStudioParameterCompanions,
    }),
  ],
};

export default hypitPackage;
