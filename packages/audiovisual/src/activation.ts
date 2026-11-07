import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { audiovisualComponent } from "./component.js";
import { audiovisualManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audiovisualManifest }],
  facets: [
    createProducerPackageFacet(audiovisualComponent.producers),
    createRefinementPackageFacet(audiovisualComponent.refinements),
  ],
};

export default hypitPackage;
