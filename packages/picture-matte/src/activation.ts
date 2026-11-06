import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createNlePackageFacet } from "@hypit/nle";

import { pictureMatteComponent } from "./component.js";
import { pictureMatteManifest } from "./manifest.js";
import { pictureMatteNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureMatteManifest }],
  facets: [
    createProducerPackageFacet(pictureMatteComponent.producers),
    createRefinementPackageFacet(pictureMatteComponent.refinements),
    createNlePackageFacet({ mattes: [pictureMatteNleResolver] }),
  ],
};

export default hypitPackage;
