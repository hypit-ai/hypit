import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { pictureFrameComponent } from "./component.js";
import { pictureFrameManifest } from "./manifest.js";
import { pictureFrameNleAuthoring, pictureFrameNleOccurrence, pictureFrameNleResolver } from "./nle.js";
import { pictureFrameNlePresentation } from "./nle-presentation.js";
import { pictureFrameNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(pictureFrameManifest), createGenerationModuleFacet(pictureFrameManifest),
    createProducerPackageFacet(pictureFrameComponent.producers),
    createRefinementPackageFacet(pictureFrameComponent.refinements),
    createNlePackageFacet({ pictureOperators: [pictureFrameNleResolver] }),
    createNleAuthoringFacet({
      operatorParameters: [pictureFrameNleAuthoring], operatorOccurrences: [pictureFrameNleOccurrence],
    }),
    createNleTimelinePresentationFacet({ adjustments: [pictureFrameNlePresentation] }),
    createNleInspectorPresentationFacet({ operators: [pictureFrameNleInspector] }),
  ],
};
export default hypitPackage;
