import { blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import { generationProducers } from "@hypit/generation";
import { imageTransformProducers, imageTransformTypes } from "@hypit/image-operations";
import { modelArtifactInputNames, modelTextInputName } from "@hypit/generation/model-fields";
import type { ModelArtifactInput, ModelTextInput } from "@hypit/generation/model-fields";
import type { FragmentOperation } from "@hypit/hypit/author";
import { textTypes } from "@hypit/hypit/text";

import { gptImageEndpoints } from "./index.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Official clean GPT Image result: exact generation followed by the explicit,
 * replaceable Raster transform already used everywhere else. This is one
 * author-facing component but remains two visible graph operations/Needs.
 */
export function createGptImageCleanFragment(
  mediaInputs: readonly ModelArtifactInput[] = [],
  textInputs: readonly ModelTextInput[] = [],
) {
  const endpoint = gptImageEndpoints.image!;
  const names = [...mediaInputs, ...textInputs].map((item) => item.name);
  if (new Set(names).size !== names.length) throw new Error("GPT Image input names must be unique");
  const inputs = [
    { name: "draft", type: endpoint.draftType },
    { name: "cleanup", type: imageTransformTypes.program },
  ];
  const operations: FragmentOperation[] = [];
  let draft = input("draft") as ReturnType<typeof input> | ReturnType<typeof operation>;
  for (const [index, item] of textInputs.entries()) {
    const binding = endpoint.textBindings[item.port];
    if (binding === undefined) throw new Error(`gpt-image-2 has no text port ${item.port}`);
    const name = modelTextInputName(item.name);
    inputs.push({ name, type: textTypes.text });
    const id = `bind-text:${String(index + 1).padStart(4, "0")}:${item.port}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: { draft, text: input(name) },
      result: { kind: "output" as const, name: "draft" },
    });
    draft = operation(id);
  }
  for (const [index, item] of mediaInputs.entries()) {
    const binding = endpoint.mediaBindings[item.port];
    if (binding === undefined) throw new Error(`gpt-image-2 has no media port ${item.port}`);
    const inputNames = modelArtifactInputNames(item.name);
    inputs.push({ name: inputNames.binding, type: binding.type });
    inputs.push({ name: inputNames.artifact, type: blobTypes.blob });
    const id = `bind:${String(index + 1).padStart(4, "0")}:${item.port}`;
    operations.push({
      id,
      producer: binding.producer,
      inputs: { draft, binding: input(inputNames.binding), artifact: input(inputNames.artifact) },
      result: { kind: "output" as const, name: "draft" },
    });
    draft = operation(id);
  }
  operations.push(
    {
      id: "finalize-request",
      producer: endpoint.finalizeProducer,
      inputs: { draft },
      result: { kind: "output" as const, name: "request" },
    },
    {
      id: "generate",
      producer: endpoint.producer,
      inputs: { request: operation("finalize-request") },
      result: { kind: "need" as const, name: "generation" },
    },
    {
      id: "select-primary-image",
      producer: generationProducers.primaryImage,
      inputs: { set: operation("generate") },
      result: { kind: "output" as const, name: "image" },
    },
    {
      id: "clean-image",
      producer: imageTransformProducers.request,
      inputs: { source: operation("select-primary-image"), program: input("cleanup") },
      result: { kind: "need" as const, name: "image" },
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
      name: "image",
      type: blobTypes.blob,
      root: operation("clean-image"),
    }],
  });
}
