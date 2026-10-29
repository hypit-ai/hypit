import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import {
  spatialSequenceAuthorDeclarations,
  spatialSequenceComponent,
  spatialSequenceManifest,
  spatialSequenceMarkupDeclarations,
  spatialSequenceModuleRef,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: spatialSequenceManifest }],
  facets: [
    createProducerPackageFacet(spatialSequenceComponent.producers ?? []),
    createRefinementPackageFacet(spatialSequenceComponent.refinements ?? []),
    ...spatialSequenceAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...spatialSequenceMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: spatialSequenceModuleRef,
      declaration,
    })),
  ],
};
export default hypitPackage;
