import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createGenerationNodePackageFacet } from "@hypit/generation-graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";
import {
  whisperXComponent,
  whisperXGenerationNodes,
  whisperXManifest,
  whisperXTranscriptionFragment,
} from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(whisperXManifest), createGenerationModuleFacet(whisperXManifest),
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
