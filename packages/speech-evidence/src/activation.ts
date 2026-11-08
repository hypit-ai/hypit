import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createGenerationNodePackageFacet } from "@hypit/generation-graph";
import { speechEvidenceComponent } from "./component.js";
import {
  speechEvidenceAudioFragment,
  speechEvidenceGenerationNodes,
  speechEvidenceManifest,
} from "./index.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: speechEvidenceManifest }],
  facets: [
    ...[speechEvidenceComponent].flatMap((component) => [
      createProducerPackageFacet(component.producers ?? []),
      createRefinementPackageFacet(component.refinements ?? []),
    ]),
    createGenerationNodePackageFacet({
      nodes: [{
        using: speechEvidenceGenerationNodes.projectAudio,
        fragment: speechEvidenceAudioFragment,
      }],
    }),
  ],
};
export default hypitPackage;
