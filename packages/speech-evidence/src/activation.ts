import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { speechEvidenceComponent } from "./component.js";
import { speechEvidenceManifest } from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechEvidenceManifest }],
  facets: [...[speechEvidenceComponent].flatMap((component) => [createProducerPackageFacet(component), createRefinementPackageFacet(component)])],
};
export default hypitPackage;
