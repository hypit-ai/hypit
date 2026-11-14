import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createGenerationNodePackageFacet } from "@hypit/generation-graph";
import { speechEvidenceComponent } from "./component.js";
import {
  speechEvidenceAudioFragment,
  speechEvidenceGenerationNodes,
  speechEvidenceManifest,
} from "./index.js";
export const hypitPackage = {
  facets: [
    createModuleFacet(speechEvidenceManifest), createGenerationModuleFacet(speechEvidenceManifest),
    ...[speechEvidenceComponent].flatMap((component) => [
      createProducerPackageFacet(component.producers ?? []),
      createRefinementPackageFacet(component.refinements ?? []),
    ]),
    createGenerationNodePackageFacet({
      nodes: [{
        kind: "operation",
        using: speechEvidenceGenerationNodes.projectAudio,
        fragment: speechEvidenceAudioFragment,
      }],
    }),
  ],
};
export default hypitPackage;
