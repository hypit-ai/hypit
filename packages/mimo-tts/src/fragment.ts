import { artifactTypes } from "@narratage/artifact";
import { sealGraphFragment } from "@narratage/elaborator";
import { generationProducers } from "@narratage/generation";
import type { ExactModelEndpoint } from "@narratage/model-kit";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** The model result stays atomic until this deterministic projection exposes one ordinary audio Blob. */
export function createMimoTtsAudioFragment(endpoint: ExactModelEndpoint) {
  return sealGraphFragment({
    name: `@narratage/mimo-tts/${endpoint.key}-primary-audio@1`,
    inputs: [{ name: "request", type: endpoint.requestType }],
    operations: [
      {
        id: "generate",
        producer: endpoint.producer,
        inputs: { request: input("request") },
        result: { kind: "need", name: "generation", accepts: "exact" },
      },
      {
        id: "select-primary-audio",
        producer: generationProducers.primaryAudio,
        inputs: { set: operation("generate") },
        result: { kind: "output", name: "audio" },
      },
    ],
    exports: [{
      name: "audio",
      type: artifactTypes.blob,
      root: operation("select-primary-audio"),
      semanticInputs: ["request"],
      fidelity: "exact",
    }],
  });
}
