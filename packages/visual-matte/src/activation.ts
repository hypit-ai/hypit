import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { visualMatteComponent } from "./component.js";
import { visualMatteManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: visualMatteManifest }],
  facets: [
    createProducerPackageFacet(visualMatteComponent.producers),
    createRefinementPackageFacet(visualMatteComponent.refinements),
  ],
};

export default hypitPackage;
