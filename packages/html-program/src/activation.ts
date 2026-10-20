import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { htmlProgramComponent, htmlProgramManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlProgramManifest }],
  facets: [...[htmlProgramComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)])],
};
export default hypitPackage;
