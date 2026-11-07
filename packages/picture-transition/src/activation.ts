import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNlePackageFacet } from "@hypit/nle";

import { pictureTransitionComponent } from "./component.js";
import { pictureTransitionManifest } from "./manifest.js";
import { pictureTransitionNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureTransitionManifest }],
  facets: [
    createProducerPackageFacet(pictureTransitionComponent.producers),
    createRefinementPackageFacet(pictureTransitionComponent.refinements),
    createNlePackageFacet({ transitions: [pictureTransitionNleResolver] }),
  ],
};
export default hypitPackage;
