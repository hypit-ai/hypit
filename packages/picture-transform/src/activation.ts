import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { pictureTransformComponent } from "./component.js";
import { pictureTransformManifest } from "./manifest.js";
import { pictureTransformNleAuthoring, pictureTransformNleResolver } from "./nle.js";
import { pictureTransformNlePresentation } from "./nle-presentation.js";
import { pictureTransformNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureTransformManifest }],
  facets: [
    createProducerPackageFacet(pictureTransformComponent.producers),
    createRefinementPackageFacet(pictureTransformComponent.refinements),
    createNlePackageFacet({ pictureAdjustments: [pictureTransformNleResolver] }),
    createNleAuthoringFacet({ adjustmentParameters: [pictureTransformNleAuthoring] }),
    createNleTimelinePresentationFacet({ adjustments: [pictureTransformNlePresentation] }),
    createNleInspectorPresentationFacet({ adjustments: [pictureTransformNleInspector] }),
  ],
};
export default hypitPackage;
