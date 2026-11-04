import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { audiovisualMediaComponent } from "./component.js";
import { audiovisualMediaManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audiovisualMediaManifest }],
  facets: [
    createProducerPackageFacet(audiovisualMediaComponent.producers),
    createRefinementPackageFacet(audiovisualMediaComponent.refinements),
  ],
};

export default hypitPackage;
