import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { htmlDocumentManifest } from "./manifest.js";
import { htmlDocumentComponent } from "./component.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(htmlDocumentManifest), createGenerationModuleFacet(htmlDocumentManifest),
    createProducerPackageFacet(htmlDocumentComponent.producers ?? []),
    createRefinementPackageFacet(htmlDocumentComponent.refinements ?? []),
  ],
};
export default hypitPackage;
