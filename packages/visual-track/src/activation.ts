import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { visualTrackComponent, visualTrackManifest, visualTrackModuleRef, visualTrackMarkupDeclarations, visualTrackAuthorDeclarations } from "./index.js";
import { visualTrackStudioParameterCompanions, visualTrackStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualTrackManifest }],
  facets: [
    ...[visualTrackComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...visualTrackAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...visualTrackMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: visualTrackModuleRef,
      declaration,
    })),

    createStudioCompanionFacet({
      tracks: visualTrackStudioTrackCompanions,
      parameters: visualTrackStudioParameterCompanions,
    }),
  ],
};
export default hypitPackage;
