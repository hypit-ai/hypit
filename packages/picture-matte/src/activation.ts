import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { pictureMatteComponent } from "./component.js";
import { pictureMatteManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureMatteManifest }],
  facets: [
    createProducerPackageFacet(pictureMatteComponent.producers),
    createRefinementPackageFacet(pictureMatteComponent.refinements),
  ],
};

export default hypitPackage;
