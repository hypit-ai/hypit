import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import { pictureFilterComponent } from "./component.js";
import { pictureFilterManifest } from "./manifest.js";
import { pictureFilterNleAuthoring, pictureFilterNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureFilterManifest }],
  facets: [
    createProducerPackageFacet(pictureFilterComponent.producers),
    createRefinementPackageFacet(pictureFilterComponent.refinements),
    createNlePackageFacet({ effects: [pictureFilterNleResolver] }),
    createNleAuthoringFacet({ effectParameters: [pictureFilterNleAuthoring] }),
  ],
};
export default hypitPackage;
