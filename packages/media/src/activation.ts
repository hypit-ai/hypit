import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createProducerPackageFacet } from "@hypit/producer";
import { mediaComponent, mediaManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(mediaManifest), createGenerationModuleFacet(mediaManifest),
    ...[mediaComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
  ],
};

export default hypitPackage;
