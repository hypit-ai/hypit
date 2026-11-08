import { createProducerPackageFacet } from "@hypit/producer";
import { createNlePackageFacet } from "@hypit/nle";

import { audioPreservePitchComponent } from "./component.js";
import { audioPreservePitchManifest } from "./manifest.js";
import { audioPreservePitchNleResolver } from "./nle.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audioPreservePitchManifest }],
  facets: [
    createProducerPackageFacet(audioPreservePitchComponent.producers),
    createNlePackageFacet({ signalReconstructions: [audioPreservePitchNleResolver] }),
  ],
};

export default hypitPackage;
