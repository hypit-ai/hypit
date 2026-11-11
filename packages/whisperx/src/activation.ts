import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createGenerationNodePackageFacet } from "@hypit/generation-graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";
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
        kind: "operation",
        using: whisperXGenerationNodes.transcribe,
        fragment: whisperXTranscriptionFragment,
      }],
    }),
    createGenerationCanvasPresentationFacet({ nodes: [{
      using: whisperXGenerationNodes.transcribe,
      displayName: "WhisperX · Transcription",
      role: "transcript",
    }] }),
  ],
};
export default hypitPackage;
