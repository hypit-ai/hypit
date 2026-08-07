import { artifactTypes } from "@narratage/artifact";
import { contractTypes } from "@narratage/contracts";
import { sealGraphFragment } from "@narratage/elaborator";
import { generationProducers } from "@narratage/generation";
import type { ExactModelEndpoint } from "@narratage/model-kit";
import type { ProducerRef } from "@narratage/protocol";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Keep the remote GeneratedVideoSet atomic, then deterministically expose its
 * primary video as an ordinary BlobArtifact for downstream media programs.
 */
export function createSeedanceGenerationFragment(endpoint: ExactModelEndpoint) {
  return sealGraphFragment({
    name: `@narratage/seedance/${endpoint.key}-primary-video@1`,
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
      type: artifactTypes.blob,
      root: operation("select-primary-video"),
      semanticInputs: ["request"],
      fidelity: "exact",
    }],
  });
}

export function createSeedanceSpeechGenerationFragment(
  endpoint: ExactModelEndpoint,
  compileProducer: ProducerRef,
) {
  return sealGraphFragment({
    name: `@narratage/seedance/${endpoint.key}-speech-primary-video@1`,
    inputs: [
      { name: "program", type: { module: endpoint.producer.module, name: "SpeechProgram" } },
      { name: "duration", type: contractTypes.speechDuration },
    ],
    operations: [
      {
        id: "compile-request",
        producer: compileProducer,
        inputs: { program: input("program"), duration: input("duration") },
        result: { kind: "output", name: "request" },
      },
      {
        id: "generate",
        producer: endpoint.producer,
        inputs: { request: operation("compile-request") },
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
      type: artifactTypes.blob,
      root: operation("select-primary-video"),
      semanticInputs: ["program", "duration"],
      fidelity: "exact",
    }],
  });
}
