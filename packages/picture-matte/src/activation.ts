import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";

import { pictureMatteComponent } from "./component.js";
import { pictureMatteManifest } from "./manifest.js";
import { pictureMatteNleAuthoring, pictureMatteNleResolver } from "./nle.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(pictureMatteManifest), createGenerationModuleFacet(pictureMatteManifest),
    createProducerPackageFacet(pictureMatteComponent.producers),
    createRefinementPackageFacet(pictureMatteComponent.refinements),
    createNlePackageFacet({ mattes: [pictureMatteNleResolver] }),
    createNleAuthoringFacet({ matteParameters: [pictureMatteNleAuthoring] }),
  ],
};

export default hypitPackage;
