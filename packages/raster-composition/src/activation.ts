import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { rasterCompositionComponent, rasterCompositionManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(rasterCompositionManifest), createGenerationModuleFacet(rasterCompositionManifest),
    createProducerPackageFacet(rasterCompositionComponent.producers),
    createRefinementPackageFacet(rasterCompositionComponent.refinements),
  ],
};
export default hypitPackage;
