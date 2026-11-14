import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createProducerPackageFacet } from "@hypit/producer";
import { generationComponent, generationManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(generationManifest), createGenerationModuleFacet(generationManifest),...[generationComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])])],
};

export default hypitPackage;
