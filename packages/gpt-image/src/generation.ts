import type { GenerationGraphInput, GenerationOperationNodeDeclaration, } from "@hypit/hypit/generation/graph";
import type { GenerationNodeAuthoringShape } from "@hypit/hypit/generation/graph";
import type { GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { blobTypes } from "@hypit/hypit/generation/blob";
import { canonicalize, type CanonicalValue } from "@hypit/hypit/value";
import { sealPrompt } from "@hypit/hypit/prompt";
import {
  collectIndexedFieldModelArtifacts,
  fieldModelGraphOperation,
} from "@hypit/generation-model/model-fields/graph";
import {
  modelAuthoringControl,
  modelAuthoringMediaList,
  verifyModelFields,
  type ModelFieldValue,
} from "@hypit/generation-model/model-fields";

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

export const gptImageGenerationPresentation: GenerationCanvasNodePresentation = {
  using: gptImageGenerationNodes.image,
  displayName: "Image Generation",
  modelLabel: "GPT Image 2",
  role: "image",
  summaryInput: "prompt",
  authoring: {
    controls: [
      { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the image to create" },
      { id: "aspectRatio", label: "Aspect ratio", placement: "compact" },
      { id: "resolution", label: "Resolution", placement: "compact" },
      { id: "background", label: "Background", placement: "advanced" },
    ],
    ports: [{ id: "images", label: "Reference images" }],
  },
};

const gptImageAuthoring: GenerationNodeAuthoringShape = {
  using: gptImageGenerationNodes.image,
  output: { type: blobTypes.blob, connectable: true, media: ["image"] },
  controls: [
    modelAuthoringControl(gptImageEndpoints.image!.fields, "prompt"),
    modelAuthoringControl(gptImageEndpoints.image!.fields, "aspectRatio"),
    modelAuthoringControl(gptImageEndpoints.image!.fields, "resolution"),
    modelAuthoringControl(gptImageEndpoints.image!.fields, "background"),
  ],
  ports: [modelAuthoringMediaList(gptImageEndpoints.image!.fields, "images", [{ field: "images" }])],
};

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
  output: blobTypes.blob,
  authoring: gptImageAuthoring,
  resolve({ node }) {
    const subject = `GPT Image Node ${node.id}`;
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
    const consumedInputs = Object.keys(node.inputs);
    if (node.inputs.prompt !== undefined && "value" in node.inputs.prompt
      && typeof node.inputs.prompt.value === "string") sealPrompt(node.inputs.prompt.value);
    const supplied = Object.fromEntries(["aspectRatio", "resolution", "background"].flatMap((name) => {
      const input = node.inputs[name];
      if (input === undefined) return [];
      assert("value" in input, `${subject} input ${name} must be an authored value.`);
      return [[name, [input.value]]];
    }));
    verifyModelFields(endpoint.fields, supplied, {
      defer: endpoint.fields.fields.map((field) => field.name),
    });
    const missing = ["prompt", "aspectRatio", "resolution"].filter((name) => node.inputs[name] === undefined);
    if (missing.length > 0) return { kind: "incomplete", consumedInputs, missing };
    const background = node.inputs.background === undefined
      ? undefined
      : authoredValue(node.inputs, "background", subject);
    return {
      kind: "ready",
      consumedInputs,
      compiled: fieldModelGraphOperation({
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
      }),
    };
  },
};
