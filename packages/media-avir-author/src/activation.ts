import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";


import { mediaAvirAuthorComponent } from "./component.js";
import { mediaAvirAuthorFacets } from "./declaration.js";
import { mediaAvirAuthorManifest } from "./manifest.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(mediaAvirAuthorManifest), createGenerationModuleFacet(mediaAvirAuthorManifest),
    createProducerPackageFacet(mediaAvirAuthorComponent.producers),
    ...mediaAvirAuthorFacets,
  ],
};

export default hypitPackage;
