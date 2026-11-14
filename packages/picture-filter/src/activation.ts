import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import { pictureFilterComponent } from "./component.js";
import { pictureFilterManifest } from "./manifest.js";
import { pictureFilterNleAuthoring, pictureFilterNleOccurrence, pictureFilterNleResolver } from "./nle.js";
import { pictureFilterNlePresentation } from "./nle-presentation.js";
import { pictureFilterNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(pictureFilterManifest), createGenerationModuleFacet(pictureFilterManifest),
    createProducerPackageFacet(pictureFilterComponent.producers),
    createRefinementPackageFacet(pictureFilterComponent.refinements),
    createNlePackageFacet({ pictureOperators: [pictureFilterNleResolver] }),
    createNleAuthoringFacet({
      operatorParameters: [pictureFilterNleAuthoring], operatorOccurrences: [pictureFilterNleOccurrence],
    }),
    createNleTimelinePresentationFacet({ adjustments: [pictureFilterNlePresentation] }),
    createNleInspectorPresentationFacet({ operators: [pictureFilterNleInspector] }),
  ],
};
export default hypitPackage;
