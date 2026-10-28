import { blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import { generationProducers } from "@hypit/generation";
import { createFieldModelPrimaryFragment } from "@hypit/generation/model-fields";
import type { FieldModelOperation, ModelArtifactInput, ModelTextInput } from "@hypit/generation/model-fields";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Keep the remote GeneratedVideoSet atomic, then deterministically expose its
 * primary video as an ordinary Blob for downstream media programs.
 */
export function createSeedanceGenerationFragment(endpoint: FieldModelOperation) {
  return sealGraphFragment({
    inputs: [{ name: "request", type: endpoint.requestType }],
    operations: [
      {
        id: "generate",
        producer: endpoint.producer,
        inputs: { request: input("request") },
        result: { kind: "need" as const, name: "generation" },
      },
      {
        id: "select-primary-video",
        producer: generationProducers.primaryVideo,
        inputs: { set: operation("generate") },
        result: { kind: "output" as const, name: "video" },
      },
    ],
    exports: [{
      name: "video",
      type: blobTypes.blob,
      root: operation("select-primary-video"),
    }],
  });
}

/** Request assembly used by author declarations whose media references may be runtime outputs. */
export function createSeedanceAssembledGenerationFragment(
  endpoint: FieldModelOperation,
  mediaInputs: readonly ModelArtifactInput[] = [],
  textInputs: readonly ModelTextInput[] = [],
) {
  return createFieldModelPrimaryFragment(endpoint, mediaInputs, textInputs);
}
