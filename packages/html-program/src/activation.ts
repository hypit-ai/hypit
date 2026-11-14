import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { htmlProgramComponent, htmlProgramManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(htmlProgramManifest), createGenerationModuleFacet(htmlProgramManifest),
    createProducerPackageFacet(htmlProgramComponent.producers),
    createRefinementPackageFacet(htmlProgramComponent.refinements),
  ],
};
export default hypitPackage;
