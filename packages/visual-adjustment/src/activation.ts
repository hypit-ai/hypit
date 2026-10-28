import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { visualAdjustmentComponent } from "./component.js";
import { visualAdjustmentManifest, visualAdjustmentModuleRef } from "./manifest.js";
import { visualAdjustmentMarkupDeclarations } from "./declaration.js";
import { visualAdjustmentAuthorDeclarations } from "./declaration.js";
import { visualAdjustmentStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualAdjustmentManifest }],
  facets: [
    createProducerPackageFacet(visualAdjustmentComponent.producers),
    createRefinementPackageFacet(visualAdjustmentComponent.refinements),
    ...visualAdjustmentAuthorDeclarations.map((declaration) => createAuthorDeclarationFacet(declaration)),
    ...visualAdjustmentMarkupDeclarations.map((declaration) => createMarkupDeclarationFacet({
      module: visualAdjustmentModuleRef,
      declaration,
    })),
    createStudioCompanionFacet({ tracks: visualAdjustmentStudioTrackCompanions }),
  ],
};
export default hypitPackage;
