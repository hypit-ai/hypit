import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";

import { pictureFrameComponent } from "./component.js";
import { pictureFrameManifest } from "./manifest.js";
import { pictureFrameNleAuthoring, pictureFrameNleResolver } from "./nle.js";
import { pictureFrameNlePresentation } from "./nle-presentation.js";
import { pictureFrameNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureFrameManifest }],
  facets: [
    createProducerPackageFacet(pictureFrameComponent.producers),
    createRefinementPackageFacet(pictureFrameComponent.refinements),
    createNlePackageFacet({ pictureAdjustments: [pictureFrameNleResolver] }),
    createNleAuthoringFacet({ adjustmentParameters: [pictureFrameNleAuthoring] }),
    createNleTimelinePresentationFacet({ adjustments: [pictureFrameNlePresentation] }),
    createNleInspectorPresentationFacet({ adjustments: [pictureFrameNleInspector] }),
  ],
};
export default hypitPackage;
