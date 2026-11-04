import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { mediaExtractionComponent, mediaExtractionManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mediaExtractionManifest }],
  facets: [
    createProducerPackageFacet(mediaExtractionComponent.producers),
    createRefinementPackageFacet(mediaExtractionComponent.refinements),
  ],
};
export default hypitPackage;
