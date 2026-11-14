import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import { pictureTransitionComponent } from "./component.js";
import { pictureTransitionManifest } from "./manifest.js";
import { pictureTransitionNleAuthoring, pictureTransitionNleResolver } from "./nle.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(pictureTransitionManifest), createGenerationModuleFacet(pictureTransitionManifest),
    createProducerPackageFacet(pictureTransitionComponent.producers),
    createRefinementPackageFacet(pictureTransitionComponent.refinements),
    createNlePackageFacet({ transitions: [pictureTransitionNleResolver] }),
    createNleAuthoringFacet({ transitionParameters: [pictureTransitionNleAuthoring] }),
  ],
};
export default hypitPackage;
