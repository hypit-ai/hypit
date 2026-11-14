import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { audiovisualHtmlComponent } from "./component.js";
import { audiovisualHtmlManifest } from "./manifest.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(audiovisualHtmlManifest), createGenerationModuleFacet(audiovisualHtmlManifest),
    createProducerPackageFacet(audiovisualHtmlComponent.producers),
    createRefinementPackageFacet(audiovisualHtmlComponent.refinements),
  ],
};

export default hypitPackage;
