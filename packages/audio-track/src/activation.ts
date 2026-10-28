import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { audioTrackComponent, audioTrackManifest, audioTrackAuthorDeclarations, audioTrackMarkupDeclarations, audioTrackModuleRef } from "./index.js";
import { audioTrackStudioParameterCompanions, audioTrackStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audioTrackManifest }],
  facets: [
    ...[audioTrackComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...audioTrackAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...audioTrackMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: audioTrackModuleRef,
      declaration,
    })),
    createStudioCompanionFacet({
      tracks: audioTrackStudioTrackCompanions,
      parameters: audioTrackStudioParameterCompanions,
    }),
  ],
};
export default hypitPackage;
