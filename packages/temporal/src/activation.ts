import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { temporalManifest } from "./index.js";
import { temporalComponent } from "./component.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: temporalManifest }],
  facets: [
    createProducerPackageFacet(temporalComponent.producers),
    createRefinementPackageFacet(temporalComponent.refinements ?? []),
  ],
};
export default hypitPackage;
