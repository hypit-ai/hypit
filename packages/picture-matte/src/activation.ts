import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import { pictureMatteComponent } from "./component.js";
import { pictureMatteManifest } from "./manifest.js";
import { pictureMatteNleAuthoring, pictureMatteNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureMatteManifest }],
  facets: [
    createProducerPackageFacet(pictureMatteComponent.producers),
    createRefinementPackageFacet(pictureMatteComponent.refinements),
    createNlePackageFacet({ mattes: [pictureMatteNleResolver] }),
    createNleAuthoringFacet({ matteParameters: [pictureMatteNleAuthoring] }),
  ],
};

export default hypitPackage;
