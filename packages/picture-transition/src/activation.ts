import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { pictureTransitionComponent } from "./component.js";
import { pictureTransitionManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureTransitionManifest }],
  facets: [
    createProducerPackageFacet(pictureTransitionComponent.producers),
    createRefinementPackageFacet(pictureTransitionComponent.refinements),
  ],
};
export default hypitPackage;
