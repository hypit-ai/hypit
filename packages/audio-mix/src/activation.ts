import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { audioMixComponent } from "./component.js";
import { audioMixManifest } from "./manifest.js";

export const hypitPackage = { format: "hypit.package@1" as const, modules: [{ manifest: audioMixManifest }], facets: [
  createProducerPackageFacet(audioMixComponent.producers), createRefinementPackageFacet(audioMixComponent.refinements),
] };
export default hypitPackage;
