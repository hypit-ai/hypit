import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { timelineAuthorComponent, timelineAuthorManifest, timelineAuthorModuleRef, timelineAuthorDeclarations, timelineAuthorMarkupDeclarations } from "./index.js";
import { timelineAuthorStudioTemporalDeclarations, timelineAuthorStudioTemporalRelations } from "./studio.js";
import { timelineAuthorLegacyStudioRelations } from "./legacy-studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: timelineAuthorManifest,
  }],
  facets: [
    createStudioCompanionFacet({
      temporalDeclarations: timelineAuthorStudioTemporalDeclarations,
      temporalRelations: [...timelineAuthorStudioTemporalRelations, ...timelineAuthorLegacyStudioRelations],
    }),
    createProducerPackageFacet(timelineAuthorComponent.producers),
    createRefinementPackageFacet(timelineAuthorComponent.refinements ?? []),
    ...timelineAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...timelineAuthorMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: timelineAuthorModuleRef,
      declaration,
    })),
       ],
};
export default hypitPackage;
