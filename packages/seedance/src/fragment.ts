import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";
import { generationProducers } from "@svml/generation";
import type { ExactModelEndpoint } from "@svml/model-kit";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Keep the remote GeneratedVideoSet atomic, then deterministically expose its
 * primary video as an ordinary BlobArtifact for downstream media programs.
 */
export function createSeedanceGenerationFragment(endpoint: ExactModelEndpoint) {
  return sealGraphFragment({
    name: `@svml/seedance/${endpoint.key}-primary-video@1`,
    inputs: [{ name: "request", type: endpoint.requestType }],
    operations: [
      {
        id: "generate",
        producer: endpoint.producer,
        inputs: { request: input("request") },
        result: { kind: "need", name: "generation", accepts: "exact" },
      },
      {
        id: "select-primary-video",
        producer: generationProducers.primaryVideo,
        inputs: { set: operation("generate") },
        result: { kind: "output", name: "video" },
      },
    ],
    exports: [{
      name: "video",
      type: contractTypes.blobArtifact,
      root: operation("select-primary-video"),
      semanticInputs: ["request"],
      affinity: [{
        resultPointer: "/digest",
        source: operation("generate"),
        sourcePointer: "/videos/0/digest",
      }],
      fidelity: "exact",
    }],
  });
}
