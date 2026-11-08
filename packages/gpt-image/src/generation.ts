import type {
  GenerationGraphInput,
  GenerationOperationNodeDeclaration,
} from "@hypit/hypit/generation-graph";
import { canonicalize, type CanonicalValue } from "@hypit/hypit/protocol";
import { sealPrompt } from "@hypit/hypit/prompt";
import {
  collectIndexedFieldModelArtifacts,
  fieldModelGraphOperation,
} from "@hypit/generation/model-fields/graph";
import type { ModelFieldValue } from "@hypit/generation/model-fields";

import {
  gptImageEndpoints,
  gptImageModuleRef,
  sealGptImage2Draft,
} from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const gptImageGenerationNodes = {
  image: { module: gptImageModuleRef, name: "gpt-image-2.image" },
} as const;

function authoredValue(
  inputs: Readonly<Record<string, GenerationGraphInput>>,
  name: string,
  subject: string,
): CanonicalValue {
  const input = inputs[name];
  assert(input !== undefined && "value" in input,
    `${subject} input ${name} must be an authored value.`);
  return input.value;
}

function promptInput(input: GenerationGraphInput): GenerationGraphInput {
  if ("node" in input) return input;
  return typeof input.value === "string"
    ? { value: canonicalize(sealPrompt(input.value)) }
    : input;
}

export const gptImageGenerationNode: GenerationOperationNodeDeclaration = {
  kind: "operation",
  using: gptImageGenerationNodes.image,
  compile({ node }) {
    const subject = `GPT Image Node ${node.id}`;
    for (const name of ["prompt", "aspectRatio", "resolution"]) {
      assert(node.inputs[name] !== undefined, `${subject} is missing input ${name}.`);
    }
    const endpoint = gptImageEndpoints.image!;
    const collected = collectIndexedFieldModelArtifacts({
      endpoint,
      inputs: node.inputs,
      fields: [{ field: "images", role: "image" }],
      subject,
    });
    const fixed = new Set(["prompt", "aspectRatio", "resolution", "background"]);
    for (const name of Object.keys(node.inputs)) {
      assert(fixed.has(name) || collected.consumed.has(name),
        `${subject} has unknown input ${name}.`);
    }
    const background = node.inputs.background === undefined
      ? undefined
      : authoredValue(node.inputs, "background", subject);
    return fieldModelGraphOperation({
      endpoint,
      draft: sealGptImage2Draft({
        aspectRatio: [authoredValue(node.inputs, "aspectRatio", subject) as ModelFieldValue],
        resolution: [authoredValue(node.inputs, "resolution", subject) as ModelFieldValue],
        ...(background === undefined ? {} : { background: [background as ModelFieldValue] }),
      }),
      artifacts: collected.artifacts,
      textFields: [{
        name: "prompt",
        field: "prompt",
        source: promptInput(node.inputs.prompt!),
      }],
    });
  },
};
