import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { audiovisualAuthorComponent } from "./component.js";
import { audiovisualAuthorManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audiovisualAuthorManifest }],
  facets: [
    createProducerPackageFacet(audiovisualAuthorComponent.producers),
    createRefinementPackageFacet(audiovisualAuthorComponent.refinements),
  ],
};

export default hypitPackage;
