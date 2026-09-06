import { artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import { generationProducers } from "@hypit/generation";
import { createExactModelPrimaryGenerationFragment } from "@hypit/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput, ExactModelTextInput } from "@hypit/model-kit";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Keep the remote GeneratedVideoSet atomic, then deterministically expose its
 * primary video as an ordinary BlobArtifact for downstream media programs.
 */
export function createSeedanceGenerationFragment(endpoint: ExactModelEndpoint) {
  return sealGraphFragment({
    inputs: [{ name: "request", type: endpoint.requestType }],
    operations: [
      {
        id: "generate",
        producer: endpoint.producer,
        inputs: { request: input("request") },
        result: { kind: "need", name: "generation" },
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
      type: artifactTypes.blob,
      root: operation("select-primary-video"),
    }],
  });
}

/** Request assembly used by author Surfaces whose media references may be runtime outputs. */
export function createSeedanceAssembledGenerationFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
  textInputs: readonly ExactModelTextInput[] = [],
) {
  return createExactModelPrimaryGenerationFragment(endpoint, mediaInputs, textInputs);
}
