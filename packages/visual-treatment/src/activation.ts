import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { visualTreatmentComponent } from "./component.js";
import { visualTreatmentManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualTreatmentManifest }],
  facets: [
    createProducerPackageFacet(visualTreatmentComponent.producers),
    createRefinementPackageFacet(visualTreatmentComponent.refinements),
  ],
};
export default hypitPackage;
