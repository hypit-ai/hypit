import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";

import { audioProgramComponent } from "./component.js";
import { audioProgramManifest } from "./manifest.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audioProgramManifest }],
  facets: [
    createProducerPackageFacet(audioProgramComponent.producers ?? []),
    createRefinementPackageFacet(audioProgramComponent.refinements ?? []),
  ],
};

export default hypitPackage;
