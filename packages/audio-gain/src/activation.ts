import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createNleAuthoringFacet, createNlePackageFacet } from "@hypit/nle";
import { audioGainComponent } from "./component.js";
import { audioGainManifest } from "./manifest.js";
import { audioGainNleAuthoring, audioGainNleResolver } from "./nle.js";

export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: audioGainManifest }], facets: [
  createProducerPackageFacet(audioGainComponent.producers), createRefinementPackageFacet(audioGainComponent.refinements),
  createNlePackageFacet({ audioEffects: [audioGainNleResolver] }),
  createNleAuthoringFacet({ effectParameters: [audioGainNleAuthoring] }),
] };
export default hypitPackage;
