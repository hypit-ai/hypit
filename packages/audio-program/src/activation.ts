import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { audioProgramComponent } from "./component.js";
import { audioProgramManifest } from "./manifest.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(audioProgramManifest), createGenerationModuleFacet(audioProgramManifest),
    createProducerPackageFacet(audioProgramComponent.producers ?? []),
    createRefinementPackageFacet(audioProgramComponent.refinements ?? []),
  ],
};

export default hypitPackage;
