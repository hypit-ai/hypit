import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createGenerationNodePackageFacet } from "@hypit/generation-graph";
import {
  whisperXComponent,
  whisperXGenerationNodes,
  whisperXManifest,
  whisperXTranscriptionFragment,
} from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: whisperXManifest }],
  facets: [
    createProducerPackageFacet(whisperXComponent.producers),
    createGenerationNodePackageFacet({
      nodes: [{
        using: whisperXGenerationNodes.transcribe,
        fragment: whisperXTranscriptionFragment,
      }],
    }),
  ],
};
export default hypitPackage;
