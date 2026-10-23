import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { htmlProgramComponent, htmlProgramManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlProgramManifest }],
  facets: [
    createProducerPackageFacet(htmlProgramComponent.producers),
    createRefinementPackageFacet(htmlProgramComponent.refinements),
  ],
};
export default hypitPackage;
