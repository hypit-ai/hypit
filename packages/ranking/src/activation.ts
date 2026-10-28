import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";

import {
  rankingComponent,
  rankingManifest,
  rankingModuleRef,
} from "./index.js";
import { rankingAuthorDeclarations, rankingMarkupDeclarations } from "./declaration.js";
import { rankingStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: rankingManifest,
  }],
  facets: [
    ...[rankingComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...rankingAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...rankingMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: rankingModuleRef, declaration })),
    createStudioTrackCompanionFacet(rankingStudioTrackCompanions),
  ],
};

export default hypitPackage;
