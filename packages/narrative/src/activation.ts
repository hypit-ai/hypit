import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { narrativeComponent, narrativeManifest } from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: narrativeManifest }],
  facets: [...[narrativeComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)])],
};
export default hypitPackage;
