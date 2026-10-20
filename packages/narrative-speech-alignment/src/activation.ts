import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { speechAlignmentComponent, speechAlignmentManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechAlignmentManifest }],
  facets: [...[speechAlignmentComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)])],
};
export default hypitPackage;
