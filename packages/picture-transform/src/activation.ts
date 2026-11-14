import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { pictureTransformComponent } from "./component.js";
import { pictureTransformManifest } from "./manifest.js";
import { pictureTransformNleAuthoring, pictureTransformNleOccurrence, pictureTransformNleResolver } from "./nle.js";
import { pictureTransformNlePresentation } from "./nle-presentation.js";
import { pictureTransformNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(pictureTransformManifest), createGenerationModuleFacet(pictureTransformManifest),
    createProducerPackageFacet(pictureTransformComponent.producers),
    createRefinementPackageFacet(pictureTransformComponent.refinements),
    createNlePackageFacet({ pictureOperators: [pictureTransformNleResolver] }),
    createNleAuthoringFacet({
      operatorParameters: [pictureTransformNleAuthoring], operatorOccurrences: [pictureTransformNleOccurrence],
    }),
    createNleTimelinePresentationFacet({ adjustments: [pictureTransformNlePresentation] }),
    createNleInspectorPresentationFacet({ operators: [pictureTransformNleInspector] }),
  ],
};
export default hypitPackage;
