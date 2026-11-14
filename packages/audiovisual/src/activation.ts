import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { audiovisualComponent } from "./component.js";
import { audiovisualManifest } from "./manifest.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(audiovisualManifest), createGenerationModuleFacet(audiovisualManifest),
    createProducerPackageFacet(audiovisualComponent.producers),
    createRefinementPackageFacet(audiovisualComponent.refinements),
  ],
};

export default hypitPackage;
