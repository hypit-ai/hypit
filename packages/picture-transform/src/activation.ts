import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { pictureTransformComponent } from "./component.js";
import { pictureTransformManifest } from "./manifest.js";
import { pictureTransformNleAuthoring, pictureTransformNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureTransformManifest }],
  facets: [
    createProducerPackageFacet(pictureTransformComponent.producers),
    createRefinementPackageFacet(pictureTransformComponent.refinements),
    createNlePackageFacet({ effects: [pictureTransformNleResolver] }),
    createNleAuthoringFacet({ effectParameters: [pictureTransformNleAuthoring] }),
  ],
};
export default hypitPackage;
