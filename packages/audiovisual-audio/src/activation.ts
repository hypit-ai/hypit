import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { audiovisualAudioComponent } from "./component.js";
import { audiovisualAudioManifest } from "./manifest.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(audiovisualAudioManifest), createGenerationModuleFacet(audiovisualAudioManifest),
    createProducerPackageFacet(audiovisualAudioComponent.producers),
    createRefinementPackageFacet(audiovisualAudioComponent.refinements),
  ],
};

export default hypitPackage;
