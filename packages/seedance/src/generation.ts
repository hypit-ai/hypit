import type {
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationOperationNodeDeclaration,
} from "@hypit/hypit/generation-graph";
import type { GenerationNodeAuthoringShape } from "@hypit/hypit/generation-graph";
import type { GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { blobTypes } from "@hypit/hypit/blob";
import {
  modelAuthoringControl,
  modelAuthoringMediaList,
  modelAuthoringMediaSlot,
  sealModelFieldBuilder,
  type FieldModelOperation,
  type ModelFieldBuilder,
  type ModelFieldValue,
  verifyModelFields,
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function component(model: SeedanceModel) {
  return { module: seedanceModuleRef, name: `${model}.video` } as const;
}

export const seedanceGenerationNodes = Object.fromEntries(seedanceModels.map((model) =>
  [model, component(model)])) as Readonly<Record<SeedanceModel, ReturnType<typeof component>>>;

const seedanceModelLabels: Readonly<Record<SeedanceModel, string>> = {
  "seedance-2": "Seedance 2",
  "seedance-2-fast": "Seedance 2 Fast",
  "seedance-2-mini": "Seedance 2 Mini",
  "seedance-2.5": "Seedance 2.5",
};

const SEEDANCE_GRAPH_DEFAULTS = {
  resolution: "720p",
  aspectRatio: "9:16",
  generateAudio: false,
  webSearch: false,
} as const;

export const seedanceGenerationPresentations: readonly GenerationCanvasNodePresentation[] =
  seedanceModels.map((model) => ({
    using: seedanceGenerationNodes[model],
    displayName: `${seedanceModelLabels[model]} Video`,
    modelLabel: seedanceModelLabels[model],
    role: "video" as const,
    summaryInput: "prompt",
    authoring: {
      controls: [
        { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the video to create" },
        { id: "duration", label: "Duration", placement: "compact" },
        { id: "resolution", label: "Resolution", placement: "compact" },
        { id: "aspectRatio", label: "Aspect ratio", placement: "compact" },
        { id: "generateAudio", label: "Generate audio", placement: "advanced" },
        { id: "webSearch", label: "Web search", placement: "advanced" },
      ],
      ports: [
        { id: "firstFrame", label: "First frame" },
        { id: "lastFrame", label: "Last frame" },
        { id: "references", label: "References" },
      ],
      variants: [
        { value: "references", label: "References" },
        { value: "frames", label: "First / last frame" },
        { value: "text", label: "Text" },
      ],
    },
  }));

function seedanceAuthoring(model: SeedanceModel): GenerationNodeAuthoringShape {
  const fields = seedanceEndpointsByModel[model].fields;
  const personSuffix = { personReference: { kind: "suffix" as const } };
  const personFalse = { personReference: false };
  const references = modelAuthoringMediaList(fields, "references", [
    { field: "referenceImage", itemBindings: personSuffix, itemDefaults: personFalse },
    { field: "referenceVideo", itemBindings: personSuffix, itemDefaults: personFalse },
    { field: "referenceAudio" },
  ], { minItems: 0 });
  return {
    using: seedanceGenerationNodes[model],
    output: { type: blobTypes.blob, connectable: true, media: ["video"] },
    controls: [
      modelAuthoringControl(fields, "prompt"),
      modelAuthoringControl(fields, "duration"),
      modelAuthoringControl(fields, "resolution", { default: SEEDANCE_GRAPH_DEFAULTS.resolution }),
      modelAuthoringControl(fields, "aspectRatio", { default: SEEDANCE_GRAPH_DEFAULTS.aspectRatio }),
      modelAuthoringControl(fields, "generateAudio", { default: SEEDANCE_GRAPH_DEFAULTS.generateAudio }),
      modelAuthoringControl(fields, "webSearch", { default: SEEDANCE_GRAPH_DEFAULTS.webSearch }),
    ],
    ports: [
      modelAuthoringMediaSlot(fields, "firstFrame", {
        required: true,
        itemBindings: { personReference: { kind: "sibling", name: "firstFramePersonReference" } },
        itemDefaults: personFalse,
      }),
      modelAuthoringMediaSlot(fields, "lastFrame", {
        itemBindings: { personReference: { kind: "sibling", name: "lastFramePersonReference" } },
        itemDefaults: personFalse,
      }),
      {
        ...references,
        entries: references.entries.map((entry) => entry.role === "audio" && model !== "seedance-2.5"
          ? { ...entry, requiresAnyRole: ["image", "video"] as const }
          : entry),
      },
    ],
    variant: {
      input: "mode",
      default: "references",
      variants: [
        { value: "references", active: ["prompt", "duration", "resolution", "aspectRatio", "generateAudio", "references"], requiresOneOf: ["references"] },
        { value: "frames", active: ["prompt", "duration", "resolution", "aspectRatio", "generateAudio", "firstFrame", "lastFrame"] },
        { value: "text", active: ["prompt", "duration", "resolution", "aspectRatio", "generateAudio", "webSearch"] },
      ],
    },
  };
}

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

function inspectCommonInputs(
  endpoint: FieldModelOperation,
  node: GenerationGraphNode,
  subject: string,
  known: ReadonlySet<string>,
): readonly string[] {
  for (const name of Object.keys(node.inputs)) assert(known.has(name), `${subject} has unknown input ${name}.`);
  const prompt = node.inputs.prompt;
  if (prompt !== undefined && "value" in prompt && typeof prompt.value === "string") sealPrompt(prompt.value);
  const fields = Object.fromEntries(["duration", "resolution", "aspectRatio", "generateAudio", "webSearch"].flatMap((name) => {
    const input = node.inputs[name];
    if (input === undefined) return [];
    assert("value" in input, `${subject} input ${name} must be an authored value.`);
    return [[name, [input.value]]];
  }));
  verifyModelFields(endpoint.fields, fields, { defer: endpoint.fields.fields.map((field) => field.name) });
  return Object.keys(node.inputs);
}

function draft(
  endpoint: FieldModelOperation,
  node: GenerationGraphNode,
  webSearch: boolean,
): ModelFieldBuilder {
  const fields: Readonly<Record<string, readonly ModelFieldValue[]>> = {
    duration: [authoredValue(node, "duration") as ModelFieldValue],
    resolution: [optionalAuthoredValue(node, "resolution", SEEDANCE_GRAPH_DEFAULTS.resolution) as ModelFieldValue],
    aspectRatio: [optionalAuthoredValue(node, "aspectRatio", SEEDANCE_GRAPH_DEFAULTS.aspectRatio) as ModelFieldValue],
    generateAudio: [optionalAuthoredValue(node, "generateAudio", SEEDANCE_GRAPH_DEFAULTS.generateAudio) as ModelFieldValue],
    webSearch: [webSearch],
  };
  return sealModelFieldBuilder(endpoint.fields, fields);
}

function resolveTextVideo(model: SeedanceModel, node: GenerationGraphNode) {
  const endpoint = seedanceEndpointsByModel[model];
  const required = ["mode", "prompt", "duration"];
  const optional = ["resolution", "aspectRatio", "generateAudio", "webSearch"];
  const consumedInputs = inspectCommonInputs(endpoint, node, `Seedance Node ${node.id}`,
    new Set([...required, ...optional]));
  const missing = required.filter((name) => node.inputs[name] === undefined);
  if (missing.length > 0) return { kind: "incomplete" as const, consumedInputs, missing };
  exactInputs(node, required, optional);
  return {
    kind: "ready" as const,
    consumedInputs,
    compiled: fieldModelGraphOperation({
      endpoint,
      draft: draft(endpoint, node, node.inputs.webSearch === undefined
        ? SEEDANCE_GRAPH_DEFAULTS.webSearch
        : booleanValue(node, "webSearch")),
      textFields: [{ name: "prompt", field: "prompt", source: promptInput(node) }],
    }),
  };
}

function resolveFrameVideo(model: SeedanceModel, node: GenerationGraphNode) {
  const endpoint = seedanceEndpointsByModel[model];
  const required = ["mode", "prompt", "duration", "firstFrame", "firstFramePersonReference"];
  const optional = [
    "resolution", "aspectRatio", "generateAudio", "lastFrame", "lastFramePersonReference",
  ];
  const consumedInputs = inspectCommonInputs(endpoint, node, `Seedance Node ${node.id}`,
    new Set([...required, ...optional]));
  for (const name of ["firstFramePersonReference", "lastFramePersonReference"]) {
    const input = node.inputs[name];
    if (input !== undefined) {
      assert("value" in input && typeof input.value === "boolean",
        `Seedance Node ${node.id} input ${name} must be a boolean.`);
    }
  }
  const hasLastFrame = node.inputs.lastFrame !== undefined;
  const hasLastMetadata = node.inputs.lastFramePersonReference !== undefined;
  const missing = [
    ...required.filter((name) => node.inputs[name] === undefined),
    ...(hasLastFrame && !hasLastMetadata ? ["lastFramePersonReference"] : []),
    ...(!hasLastFrame && hasLastMetadata ? ["lastFrame"] : []),
  ];
  if (missing.length > 0) return { kind: "incomplete" as const, consumedInputs, missing: [...new Set(missing)] };
  exactInputs(node, required, optional);
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
  return {
    kind: "ready" as const,
    consumedInputs,
    compiled: fieldModelGraphOperation({
      endpoint,
      draft: draft(endpoint, node, false),
      artifacts,
      textFields: [{ name: "prompt", field: "prompt", source: promptInput(node) }],
    }),
  };
}

function resolveReferenceVideo(model: SeedanceModel, node: GenerationGraphNode) {
  const endpoint = seedanceEndpointsByModel[model];
  const fixed = new Set(["mode", "prompt", "duration", "resolution", "aspectRatio", "generateAudio"]);
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
  const consumedInputs = inspectCommonInputs(endpoint, node, `Seedance Node ${node.id}`,
    new Set([...fixed, ...collected.consumed]));
  const missing = [
    ...["mode", "prompt", "duration"].filter((name) => node.inputs[name] === undefined),
    ...(collected.artifacts.length === 0 ? ["referenceImage.1 | referenceVideo.1 | referenceAudio.1"] : []),
  ];
  const audio = collected.artifacts.some((item) => item.field === "referenceAudio");
  const visual = collected.artifacts.some((item) => item.field === "referenceImage" || item.field === "referenceVideo");
  if (model !== "seedance-2.5" && audio && !visual) missing.push("referenceImage.1 | referenceVideo.1");
  if (missing.length > 0) return { kind: "incomplete" as const, consumedInputs, missing };
  exactInputs(node, ["mode", "prompt", "duration"], [
    "resolution", "aspectRatio", "generateAudio",
    ...collected.consumed,
  ]);
  return {
    kind: "ready" as const,
    consumedInputs,
    compiled: fieldModelGraphOperation({
      endpoint,
      draft: draft(endpoint, node, false),
      artifacts: collected.artifacts,
      textFields: [{ name: "prompt", field: "prompt", source: promptInput(node) }],
    }),
  };
}

function declaration(model: SeedanceModel): GenerationOperationNodeDeclaration {
  return {
    kind: "operation",
    using: seedanceGenerationNodes[model],
    output: blobTypes.blob,
    authoring: seedanceAuthoring(model),
    resolve({ node }) {
      const modeInput = node.inputs.mode;
      if (modeInput === undefined) {
        return { kind: "incomplete", consumedInputs: Object.keys(node.inputs), missing: ["mode"] };
      }
      assert("value" in modeInput && typeof modeInput.value === "string",
        `Seedance Node ${node.id} mode must be an authored value.`);
      if (modeInput.value === "text") return resolveTextVideo(model, node);
      if (modeInput.value === "frames") return resolveFrameVideo(model, node);
      if (modeInput.value === "references") return resolveReferenceVideo(model, node);
      throw new Error(`Seedance Node ${node.id} mode must be text, frames or references.`);
    },
  };
}

/** Exact model identity lives in `using`; authored inputs select its invocation shape. */
export const seedanceGenerationNodeDeclarations: readonly GenerationOperationNodeDeclaration[] =
  seedanceModels.map(declaration);
