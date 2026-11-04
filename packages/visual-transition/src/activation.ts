import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { visualTransitionComponent } from "./component.js";
import { visualTransitionManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualTransitionManifest }],
  facets: [
    createProducerPackageFacet(visualTransitionComponent.producers),
    createRefinementPackageFacet(visualTransitionComponent.refinements),
  ],
};
export default hypitPackage;
