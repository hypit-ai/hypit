import type {
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationOperationNodeDeclaration,
} from "@hypit/hypit/generation-graph";
import {
  sealModelFieldBuilder,
  type FieldModelOperation,
  type ModelFieldBuilder,
  type ModelFieldValue,
} from "@hypit/generation/model-fields";
import {
  collectIndexedFieldModelArtifacts,
  fieldModelGraphOperation,
  type FieldModelGraphArtifactInput,
} from "@hypit/generation/model-fields/graph";
import { canonicalize, type CanonicalValue } from "@hypit/hypit/protocol";
import { sealPrompt } from "@hypit/hypit/prompt";

import {
  seedanceEndpointsByModel,
  seedanceModuleRef,
  seedanceModels,
  type SeedanceModel,
} from "./index.js";

type SeedanceGenerationMode = "text-video" | "frame-video" | "reference-video";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function component(model: SeedanceModel, mode: SeedanceGenerationMode) {
  return { module: seedanceModuleRef, name: `${model}.${mode}` } as const;
}

export const seedanceGenerationNodes = Object.fromEntries(seedanceModels.map((model) => [model, {
  textVideo: component(model, "text-video"),
  frameVideo: component(model, "frame-video"),
  referenceVideo: component(model, "reference-video"),
}])) as Readonly<Record<SeedanceModel, {
  readonly textVideo: ReturnType<typeof component>;
  readonly frameVideo: ReturnType<typeof component>;
  readonly referenceVideo: ReturnType<typeof component>;
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

function draft(
  endpoint: FieldModelOperation,
  node: GenerationGraphNode,
  webSearch: boolean,
): ModelFieldBuilder {
  const fields: Readonly<Record<string, readonly ModelFieldValue[]>> = {
    duration: [authoredValue(node, "duration") as ModelFieldValue],
    resolution: [optionalAuthoredValue(node, "resolution", "720p") as ModelFieldValue],
    aspectRatio: [optionalAuthoredValue(node, "aspectRatio", "9:16") as ModelFieldValue],
    generateAudio: [optionalAuthoredValue(node, "generateAudio", false) as ModelFieldValue],
    webSearch: [webSearch],
  };
  return sealModelFieldBuilder(endpoint.fields, fields);
}

function textVideoDeclaration(model: SeedanceModel): GenerationOperationNodeDeclaration {
  const endpoint = seedanceEndpointsByModel[model];
  return {
    kind: "operation",
    using: seedanceGenerationNodes[model].textVideo,
    compile({ node }) {
      exactInputs(node, ["prompt", "duration"], ["resolution", "aspectRatio", "generateAudio", "webSearch"]);
      return fieldModelGraphOperation({
        endpoint,
        draft: draft(endpoint, node, node.inputs.webSearch === undefined
          ? false
          : booleanValue(node, "webSearch")),
        textFields: [{ name: "prompt", field: "prompt", source: promptInput(node) }],
      });
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
      const artifacts: FieldModelGraphArtifactInput[] = [{
        name: "first-frame",
        field: "firstFrame",
        role: "image",
        fields: { personReference: booleanValue(node, "firstFramePersonReference") },
        source: node.inputs.firstFrame!,
      }];
      if (hasLastFrame) {
        artifacts.push({
          name: "last-frame",
          field: "lastFrame",
          role: "image",
          fields: { personReference: booleanValue(node, "lastFramePersonReference") },
          source: node.inputs.lastFrame!,
        });
      }
      return fieldModelGraphOperation({
        endpoint,
        draft: draft(endpoint, node, false),
        artifacts,
        textFields: [{ name: "prompt", field: "prompt", source: promptInput(node) }],
      });
    },
  };
}

function referenceVideoDeclaration(model: SeedanceModel): GenerationOperationNodeDeclaration {
  const endpoint = seedanceEndpointsByModel[model];
  return {
    kind: "operation",
    using: seedanceGenerationNodes[model].referenceVideo,
    compile({ node }) {
      const fixed = new Set(["prompt", "duration", "resolution", "aspectRatio", "generateAudio"]);
      const collected = collectIndexedFieldModelArtifacts({
        endpoint,
        inputs: node.inputs,
        fields: [
          { field: "referenceImage", role: "image" },
          { field: "referenceVideo", role: "video" },
          { field: "referenceAudio", role: "audio" },
        ],
        subject: `Seedance Node ${node.id}`,
      });
      for (const name of Object.keys(node.inputs)) {
        assert(fixed.has(name) || collected.consumed.has(name),
          `Seedance Node ${node.id} has unknown input ${name}.`);
      }
      assert(collected.artifacts.length > 0, `Seedance Node ${node.id} requires at least one reference.`);
      exactInputs(node, ["prompt", "duration"], [
        "resolution", "aspectRatio", "generateAudio",
        ...collected.consumed,
      ]);
      return fieldModelGraphOperation({
        endpoint,
        draft: draft(endpoint, node, false),
        artifacts: collected.artifacts,
        textFields: [{ name: "prompt", field: "prompt", source: promptInput(node) }],
      });
    },
  };
}

/** Exact model identity lives in `using`; package code owns field assembly. */
export const seedanceGenerationNodeDeclarations: readonly GenerationOperationNodeDeclaration[] =
  seedanceModels.flatMap((model) => [
    textVideoDeclaration(model),
    frameVideoDeclaration(model),
    referenceVideoDeclaration(model),
  ]);
