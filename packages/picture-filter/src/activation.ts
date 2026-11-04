import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { pictureFilterComponent } from "./component.js";
import { pictureFilterManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureFilterManifest }],
  facets: [
    createProducerPackageFacet(pictureFilterComponent.producers),
    createRefinementPackageFacet(pictureFilterComponent.refinements),
  ],
};
export default hypitPackage;
