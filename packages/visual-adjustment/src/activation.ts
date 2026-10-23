import { createMarkupSurfaceFacet } from "@hypit/hypit/markup";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createStudioCompanionFacet } from "@hypit/studio-companion";
import { visualAdjustmentComponent } from "./component.js";
import { visualAdjustmentManifest, visualAdjustmentMarkupSurfaces, visualAdjustmentModuleRef } from "./manifest.js";
import { decodeVisualAdjustmentSurface } from "./surface.js";
import { visualAdjustmentStudioTrackCompanions } from "./studio.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualAdjustmentManifest }],
  facets: [
    createProducerPackageFacet(visualAdjustmentComponent.producers),
    createRefinementPackageFacet(visualAdjustmentComponent.refinements),
    createMarkupSurfaceFacet({ module: visualAdjustmentModuleRef,
      declaration: visualAdjustmentMarkupSurfaces[0]!, handler: decodeVisualAdjustmentSurface }),
    createStudioCompanionFacet({ tracks: visualAdjustmentStudioTrackCompanions }),
  ],
};
export default hypitPackage;
