import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createNlePackageFacet } from "@hypit/nle";

import { audioPreservePitchComponent } from "./component.js";
import { audioPreservePitchManifest } from "./manifest.js";
import { audioPreservePitchNleResolver } from "./nle.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(audioPreservePitchManifest), createGenerationModuleFacet(audioPreservePitchManifest),
    createProducerPackageFacet(audioPreservePitchComponent.producers),
    createNlePackageFacet({ signalReconstructions: [audioPreservePitchNleResolver] }),
  ],
};

export default hypitPackage;
