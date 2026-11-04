import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { rasterTransformComponent, rasterTransformManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: rasterTransformManifest }],
  facets: [
    createProducerPackageFacet(rasterTransformComponent.producers),
    createRefinementPackageFacet(rasterTransformComponent.refinements),
  ],
};
export default hypitPackage;
