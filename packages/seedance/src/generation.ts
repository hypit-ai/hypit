import type {
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationOperationNodeDeclaration,
} from "@hypit/hypit/generation-graph";
import {
  isArtifactField,
  modelArtifactInputNames,
  modelField,
  modelTextFieldInputName,
  sealModelArtifactBinding,
  sealModelFieldBuilder,
  type FieldModelOperation,
  type ModelFieldValue,
} from "@hypit/generation/model-fields";
import { canonicalize, type CanonicalValue } from "@hypit/hypit/protocol";
import { sealPrompt } from "@hypit/hypit/prompt";

import { createSeedanceAssembledGenerationFragment } from "./fragment.js";
import {
  seedanceEndpointsByModel,
  seedanceModuleRef,
  seedanceModels,
  type SeedanceModel,
} from "./index.js";

type SeedanceGenerationMode = "text-video" | "frame-video";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function component(model: SeedanceModel, mode: SeedanceGenerationMode) {
  return { module: seedanceModuleRef, name: `${model}.${mode}` } as const;
}

export const seedanceGenerationNodes = Object.fromEntries(seedanceModels.map((model) => [model, {
  textVideo: component(model, "text-video"),
  frameVideo: component(model, "frame-video"),
}])) as Readonly<Record<SeedanceModel, {
  readonly textVideo: ReturnType<typeof component>;
  readonly frameVideo: ReturnType<typeof component>;
}>>;

function exactInputs(node: GenerationGraphNode, required: readonly string[], optional: readonly string[]): void {
  const known = new Set([...required, ...optional]);
  const actual = Object.keys(node.inputs);
  for (const name of required) assert(node.inputs[name] !== undefined,
    `Seedance Node ${node.id} is missing input ${name}.`);
  for (const name of actual) assert(known.has(name),
    `Seedance Node ${node.id} has unknown input ${name}.`);
}

function authoredValue(node: GenerationGraphNode, name: string): CanonicalValue {
  const input = node.inputs[name];
  assert(input !== undefined && "value" in input,
    `Seedance Node ${node.id} input ${name} must be an authored value.`);
  return input.value;
}

function optionalAuthoredValue(
  node: GenerationGraphNode,
  name: string,
  fallback: CanonicalValue,
): CanonicalValue {
  return node.inputs[name] === undefined ? fallback : authoredValue(node, name);
}

function booleanValue(node: GenerationGraphNode, name: string): boolean {
  const value = authoredValue(node, name);
  assert(typeof value === "boolean", `Seedance Node ${node.id} input ${name} must be a boolean.`);
  return value;
}

function promptInput(node: GenerationGraphNode): GenerationGraphInput {
  const input = node.inputs.prompt!;
  if ("node" in input) return input;
  return typeof input.value === "string"
    ? { value: canonicalize(sealPrompt(input.value)) }
    : input;
}

function mediaBinding(
  endpoint: FieldModelOperation,
  fieldName: "firstFrame" | "lastFrame",
  personReference: boolean,
): CanonicalValue {
  const field = modelField(endpoint.fields, fieldName);
  assert(isArtifactField(field), `Seedance ${fieldName} is not a media field.`);
  return canonicalize(sealModelArtifactBinding(field, {
    role: "image",
    fields: { personReference },
  }));
}

function draft(
  endpoint: FieldModelOperation,
  node: GenerationGraphNode,
  webSearch: boolean,
): CanonicalValue {
  const fields: Readonly<Record<string, readonly ModelFieldValue[]>> = {
    duration: [authoredValue(node, "duration") as ModelFieldValue],
    resolution: [optionalAuthoredValue(node, "resolution", "720p") as ModelFieldValue],
    aspectRatio: [optionalAuthoredValue(node, "aspectRatio", "9:16") as ModelFieldValue],
    generateAudio: [optionalAuthoredValue(node, "generateAudio", false) as ModelFieldValue],
    webSearch: [webSearch],
  };
  return canonicalize(sealModelFieldBuilder(endpoint.fields, fields));
}

function textVideoDeclaration(model: SeedanceModel): GenerationOperationNodeDeclaration {
  const endpoint = seedanceEndpointsByModel[model];
  return {
    kind: "operation",
    using: seedanceGenerationNodes[model].textVideo,
    compile({ node }) {
      exactInputs(node, ["prompt", "duration"], ["resolution", "aspectRatio", "generateAudio", "webSearch"]);
      const fragment = createSeedanceAssembledGenerationFragment(endpoint, [], [{ name: "prompt", field: "prompt" }]);
      return {
        fragment,
        inputs: {
          draft: { value: draft(endpoint, node, node.inputs.webSearch === undefined
            ? false
            : booleanValue(node, "webSearch")) },
          [modelTextFieldInputName("prompt")]: promptInput(node),
        },
      };
    },
  };
}

function frameVideoDeclaration(model: SeedanceModel): GenerationOperationNodeDeclaration {
  const endpoint = seedanceEndpointsByModel[model];
  return {
    kind: "operation",
    using: seedanceGenerationNodes[model].frameVideo,
    compile({ node }) {
      exactInputs(node, ["prompt", "duration", "firstFrame", "firstFramePersonReference"], [
        "resolution", "aspectRatio", "generateAudio", "lastFrame", "lastFramePersonReference",
      ]);
      const hasLastFrame = node.inputs.lastFrame !== undefined;
      assert(hasLastFrame === (node.inputs.lastFramePersonReference !== undefined),
        `Seedance Node ${node.id} lastFrame and lastFramePersonReference must be supplied together.`);
      const media = [
        { name: "first-frame", field: "firstFrame" },
        ...(hasLastFrame ? [{ name: "last-frame", field: "lastFrame" }] : []),
      ];
      const fragment = createSeedanceAssembledGenerationFragment(
        endpoint,
        media,
        [{ name: "prompt", field: "prompt" }],
      );
      const first = modelArtifactInputNames("first-frame");
      const inputs: Record<string, GenerationGraphInput> = {
        draft: { value: draft(endpoint, node, false) },
        [modelTextFieldInputName("prompt")]: promptInput(node),
        [first.binding]: { value: mediaBinding(endpoint, "firstFrame", booleanValue(node, "firstFramePersonReference")) },
        [first.artifact]: node.inputs.firstFrame!,
      };
      if (hasLastFrame) {
        const last = modelArtifactInputNames("last-frame");
        inputs[last.binding] = {
          value: mediaBinding(endpoint, "lastFrame", booleanValue(node, "lastFramePersonReference")),
        };
        inputs[last.artifact] = node.inputs.lastFrame!;
      }
      return { fragment, inputs };
    },
  };
}

/** Exact model identity lives in `using`; package code owns field assembly. */
export const seedanceGenerationNodeDeclarations: readonly GenerationOperationNodeDeclaration[] =
  seedanceModels.flatMap((model) => [textVideoDeclaration(model), frameVideoDeclaration(model)]);
