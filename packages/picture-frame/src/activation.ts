import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { pictureFrameComponent } from "./component.js";
import { pictureFrameManifest } from "./manifest.js";
import { pictureFrameNleAuthoring, pictureFrameNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureFrameManifest }],
  facets: [
    createProducerPackageFacet(pictureFrameComponent.producers),
    createRefinementPackageFacet(pictureFrameComponent.refinements),
    createNlePackageFacet({ effects: [pictureFrameNleResolver] }),
    createNleAuthoringFacet({ effectParameters: [pictureFrameNleAuthoring] }),
  ],
};
export default hypitPackage;
