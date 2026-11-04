import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { rasterCompositionComponent, rasterCompositionManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: rasterCompositionManifest }],
  facets: [
    createProducerPackageFacet(rasterCompositionComponent.producers),
    createRefinementPackageFacet(rasterCompositionComponent.refinements),
  ],
};
export default hypitPackage;
