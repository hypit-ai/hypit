import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { stillVideoComponent, stillVideoManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: stillVideoManifest }],
  facets: [
    createProducerPackageFacet(stillVideoComponent.producers),
    createRefinementPackageFacet(stillVideoComponent.refinements),
  ],
};
export default hypitPackage;
