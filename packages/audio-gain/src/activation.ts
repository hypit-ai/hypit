import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { audioGainComponent } from "./component.js";
import { audioGainManifest } from "./manifest.js";

export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: audioGainManifest }], facets: [
  createProducerPackageFacet(audioGainComponent.producers), createRefinementPackageFacet(audioGainComponent.refinements),
] };
export default hypitPackage;
