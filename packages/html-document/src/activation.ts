import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { htmlDocumentManifest } from "./manifest.js";
import { htmlDocumentComponent } from "./component.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlDocumentManifest }],
  facets: [
    createProducerPackageFacet(htmlDocumentComponent.producers ?? []),
    createRefinementPackageFacet(htmlDocumentComponent.refinements ?? []),
  ],
};
export default hypitPackage;
