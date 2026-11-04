import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { audiovisualAudioComponent } from "./component.js";
import { audiovisualAudioManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audiovisualAudioManifest }],
  facets: [
    createProducerPackageFacet(audiovisualAudioComponent.producers),
    createRefinementPackageFacet(audiovisualAudioComponent.refinements),
  ],
};

export default hypitPackage;
