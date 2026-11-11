import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";
import { audioGainComponent } from "./component.js";
import { audioGainManifest } from "./manifest.js";
import { audioGainNleAuthoring, audioGainNleResolver } from "./nle.js";
import { audioGainNlePresentation } from "./nle-presentation.js";
import { audioGainNleInspector } from "./nle-inspector.js";

export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: audioGainManifest }], facets: [
  createProducerPackageFacet(audioGainComponent.producers), createRefinementPackageFacet(audioGainComponent.refinements),
  createNlePackageFacet({ audioAdjustments: [audioGainNleResolver] }),
  createNleAuthoringFacet({ adjustmentParameters: [audioGainNleAuthoring] }),
  createNleTimelinePresentationFacet({ adjustments: [audioGainNlePresentation] }),
  createNleInspectorPresentationFacet({ adjustments: [audioGainNleInspector] }),
] };
export default hypitPackage;
