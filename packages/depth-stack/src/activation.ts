import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createStudioTrackCompanionFacet } from "@hypit/studio-companion";
import { depthStackAuthorDeclarations, depthStackComponent, depthStackManifest, depthStackMarkupDeclarations, depthStackModuleRef } from "./index.js";
import { depthStackStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: depthStackManifest,
  }],
  facets: [
    ...[depthStackComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...depthStackAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...depthStackMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: depthStackModuleRef,
      declaration,
    })),

    createStudioTrackCompanionFacet(depthStackStudioTrackCompanions),
  ],
};

export default hypitPackage;
