import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";

import { pictureFilterComponent } from "./component.js";
import { pictureFilterManifest } from "./manifest.js";
import { pictureFilterNleAuthoring, pictureFilterNleResolver } from "./nle.js";
import { pictureFilterNlePresentation } from "./nle-presentation.js";
import { pictureFilterNleInspector } from "./nle-inspector.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: pictureFilterManifest }],
  facets: [
    createProducerPackageFacet(pictureFilterComponent.producers),
    createRefinementPackageFacet(pictureFilterComponent.refinements),
    createNlePackageFacet({ pictureAdjustments: [pictureFilterNleResolver] }),
    createNleAuthoringFacet({ adjustmentParameters: [pictureFilterNleAuthoring] }),
    createNleTimelinePresentationFacet({ adjustments: [pictureFilterNlePresentation] }),
    createNleInspectorPresentationFacet({ adjustments: [pictureFilterNleInspector] }),
  ],
};
export default hypitPackage;
