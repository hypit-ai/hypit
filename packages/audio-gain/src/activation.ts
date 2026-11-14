import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createProducerPackageFacet } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { createNleInspectorPresentationFacet, createNleTimelinePresentationFacet } from "@hypit/nle-view";
import { audioGainComponent } from "./component.js";
import { audioGainManifest } from "./manifest.js";
import { audioGainNleAuthoring, audioGainNleOccurrence, audioGainNleResolver } from "./nle.js";
import { audioGainNlePresentation } from "./nle-presentation.js";
import { audioGainNleInspector } from "./nle-inspector.js";

export const hypitPackage = { facets: [
    createModuleFacet(audioGainManifest), createGenerationModuleFacet(audioGainManifest),
  createProducerPackageFacet(audioGainComponent.producers), createRefinementPackageFacet(audioGainComponent.refinements),
  createNlePackageFacet({ audioOperators: [audioGainNleResolver] }),
  createNleAuthoringFacet({
    operatorParameters: [audioGainNleAuthoring], operatorOccurrences: [audioGainNleOccurrence],
  }),
  createNleTimelinePresentationFacet({ adjustments: [audioGainNlePresentation] }),
  createNleInspectorPresentationFacet({ operators: [audioGainNleInspector] }),
] };
export default hypitPackage;
