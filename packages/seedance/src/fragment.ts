import { speechTypes } from "@narratage/speech";
import { artifactTypes } from "@narratage/artifact";
import { sealGraphFragment } from "@narratage/elaborator";
import { generationProducers } from "@narratage/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
} from "@narratage/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput } from "@narratage/model-kit";
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

/** Request assembly used by author Surfaces whose media references may be runtime outputs. */
export function createSeedanceAssembledGenerationFragment(
  endpoint: ExactModelEndpoint,
  mediaInputs: readonly ExactModelMediaInput[] = [],
) {
  return createExactModelPrimaryGenerationFragment(endpoint, mediaInputs);
}

export function createSeedanceSpeechGenerationFragment(
  endpoint: ExactModelEndpoint,
  compileProducer: ProducerRef,
  mediaInputs: readonly ExactModelMediaInput[] = [],
) {
  const inputs = [
    { name: "program", type: { module: endpoint.producer.module, name: "SpeechProgram" } },
    { name: "duration", type: speechTypes.duration },
  ];
  const operations: Array<import("@narratage/elaborator").FragmentOperation> = [{
    id: "compile-draft",
    producer: compileProducer,
    inputs: { program: input("program"), duration: input("duration") },
    result: { kind: "output", name: "draft" },
  }];
  let draft = operation("compile-draft") as ReturnType<typeof input> | ReturnType<typeof operation>;
  for (const [index, item] of mediaInputs.entries()) {
    const binding = endpoint.mediaBindings[item.port];
    if (binding === undefined) throw new Error(`${endpoint.ports.model} has no media port ${item.port}`);
    const names = exactModelMediaInputNames(item.name);
    inputs.push({ name: names.binding, type: binding.type }, { name: names.artifact, type: artifactTypes.blob });
    const id = `bind:${String(index + 1).padStart(4, "0")}:${item.port}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: { draft, binding: input(names.binding), artifact: input(names.artifact) },
      result: { kind: "output", name: "draft" },
    });
    draft = operation(id);
  }
  operations.push(
    {
      id: "finalize-request",
      producer: endpoint.finalizeProducer,
      inputs: { draft },
      result: { kind: "output", name: "request" },
    },
    {
      id: "generate",
      producer: endpoint.producer,
      inputs: { request: operation("finalize-request") },
      result: { kind: "need", name: "generation", accepts: "exact" },
    },
    {
      id: "select-primary-video",
      producer: generationProducers.primaryVideo,
      inputs: { set: operation("generate") },
      result: { kind: "output", name: "video" },
    },
  );
  const shape = mediaInputs.map((item) => `${item.name}=${item.port}`).join(",") || "no-media";
  return sealGraphFragment({
    name: `@narratage/seedance/${endpoint.key}-speech-assembled-primary-video[${shape}]@1`,
    inputs,
    operations,
    exports: [{
      name: "video",
      type: artifactTypes.blob,
      root: operation("select-primary-video"),
      semanticInputs: inputs.map((entry) => entry.name),
      fidelity: "exact",
    }],
  });
}
