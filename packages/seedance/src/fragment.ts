import { speechTypes } from "@narratage/speech";
import { artifactTypes } from "@narratage/artifact";
import { sealGraphFragment } from "@narratage/elaborator";
import { generationProducers } from "@narratage/generation";
import {
  createExactModelPrimaryGenerationFragment,
  exactModelMediaInputNames,
  exactModelTextInputName,
} from "@narratage/model-kit";
import type { ExactModelEndpoint, ExactModelMediaInput, ExactModelTextInput } from "@narratage/model-kit";
import { textTypes } from "@narratage/text";
import type { ProducerRef } from "@narratage/protocol";

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

export function createSeedanceDurationGenerationFragment(
  endpoint: ExactModelEndpoint,
  compileProducer: ProducerRef,
  mediaInputs: readonly ExactModelMediaInput[] = [],
  textInputs: readonly ExactModelTextInput[] = [],
) {
  const inputs = [
    { name: "program", type: { module: endpoint.producer.module, name: "DurationProgram" } },
    { name: "duration", type: speechTypes.duration },
  ];
  const operations: Array<import("@narratage/elaborator").FragmentOperation> = [{
    id: "compile-draft",
    producer: compileProducer,
    inputs: { program: input("program"), duration: input("duration") },
    result: { kind: "output", name: "draft" },
  }];
  let draft = operation("compile-draft") as ReturnType<typeof input> | ReturnType<typeof operation>;
  for (const [index, item] of textInputs.entries()) {
    const binding = endpoint.textBindings[item.port];
    if (binding === undefined) throw new Error(`${endpoint.ports.model} has no text port ${item.port}`);
    const name = exactModelTextInputName(item.name);
    inputs.push({ name, type: textTypes.text });
    const id = `bind-text:${String(index + 1).padStart(4, "0")}:${item.port}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: { draft, text: input(name) },
      result: { kind: "output", name: "draft" },
    });
    draft = operation(id);
  }
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
      result: { kind: "need", name: "generation" },
    },
    {
      id: "select-primary-video",
      producer: generationProducers.primaryVideo,
      inputs: { set: operation("generate") },
      result: { kind: "output", name: "video" },
    },
  );
  const shape = [
    ...textInputs.map((item) => `${item.name}=${item.port}:text`),
    ...mediaInputs.map((item) => `${item.name}=${item.port}:media`),
  ].join(",") || "no-dynamic-inputs";
  return sealGraphFragment({
    inputs,
    operations,
    exports: [{
      name: "video",
      type: artifactTypes.blob,
      root: operation("select-primary-video"),
    }],
  });
}
