import type {
  GenerationGraphInput,
  GenerationGraphNode,
  GenerationOperationNodeDeclaration,
} from "@hypit/hypit/generation-graph";
import type { GenerationNodeAuthoringShape } from "@hypit/hypit/generation-graph";
import type { GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { blobTypes } from "@hypit/hypit/blob";
import { canonicalize, type CanonicalValue } from "@hypit/hypit/protocol";
import { sealText } from "@hypit/hypit/text";
import {
  fieldModelGraphOperation,
  type FieldModelGraphArtifactInput,
} from "@hypit/generation/model-fields/graph";
import {
  modelAuthoringControl,
  modelAuthoringMediaSlot,
  verifyModelFields,
  type FieldModelOperation,
  type ModelFieldValue,
} from "@hypit/generation/model-fields";

import {
  mimoSpeechEndpoints,
  mimoSpeechModuleRef,
  sealMimoSpeechRequestDraft,
} from "./index.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export const mimoSpeechGenerationNodes = {
  voiceDesign: { module: mimoSpeechModuleRef, name: "mimo-v2.5-tts-voicedesign.audio" },
  voiceClone: { module: mimoSpeechModuleRef, name: "mimo-v2.5-tts-voiceclone.audio" },
} as const;

export const mimoSpeechGenerationPresentations: readonly GenerationCanvasNodePresentation[] = [{
  using: mimoSpeechGenerationNodes.voiceDesign,
  displayName: "Voice Design",
  modelLabel: "MiMo 2.5",
  role: "audio",
  summaryInput: "speech",
  authoring: { controls: [
    { id: "speech", label: "Speech", placement: "primary", placeholder: "Words to speak" },
    { id: "voiceDescription", label: "Voice description", placement: "advanced" },
  ] },
}, {
  using: mimoSpeechGenerationNodes.voiceClone,
  displayName: "Voice Clone",
  modelLabel: "MiMo 2.5",
  role: "audio",
  summaryInput: "speech",
  authoring: {
    controls: [
      { id: "speech", label: "Speech", placement: "primary", placeholder: "Words to speak" },
      { id: "instruction", label: "Instruction", placement: "advanced" },
    ],
    ports: [{ id: "voiceReference", label: "Voice reference" }],
  },
}];

const mimoVoiceDesignAuthoring: GenerationNodeAuthoringShape = {
  using: mimoSpeechGenerationNodes.voiceDesign,
  output: { type: blobTypes.blob, connectable: true, media: ["audio"] },
  controls: [
    modelAuthoringControl(mimoSpeechEndpoints.voiceDesign.fields, "text", { id: "speech", input: "speech" }),
    modelAuthoringControl(mimoSpeechEndpoints.voiceDesign.fields, "voiceDescription"),
  ],
  ports: [],
};

const mimoVoiceCloneAuthoring: GenerationNodeAuthoringShape = {
  using: mimoSpeechGenerationNodes.voiceClone,
  output: { type: blobTypes.blob, connectable: true, media: ["audio"] },
  controls: [
    modelAuthoringControl(mimoSpeechEndpoints.voiceClone.fields, "text", { id: "speech", input: "speech" }),
    modelAuthoringControl(mimoSpeechEndpoints.voiceClone.fields, "instruction"),
  ],
  ports: [modelAuthoringMediaSlot(mimoSpeechEndpoints.voiceClone.fields, "voiceReference")],
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

function textInput(input: GenerationGraphInput): GenerationGraphInput {
  if ("node" in input) return input;
  return typeof input.value === "string"
    ? { value: canonicalize(sealText(input.value)) }
    : input;
}

function exactInputs(
  inputs: Readonly<Record<string, GenerationGraphInput>>,
  subject: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const known = new Set([...required, ...optional]);
  for (const name of required) {
    assert(inputs[name] !== undefined, `${subject} is missing input ${name}.`);
  }
  for (const name of Object.keys(inputs)) {
    assert(known.has(name), `${subject} has unknown input ${name}.`);
  }
}

function resolveInputs(
  node: GenerationGraphNode,
  endpoint: FieldModelOperation,
  subject: string,
  required: readonly string[],
  optional: readonly string[] = [],
  scalarInputs: readonly { readonly input: string; readonly field: string }[] = [],
) {
  const known = new Set([...required, ...optional]);
  for (const name of Object.keys(node.inputs)) assert(known.has(name), `${subject} has unknown input ${name}.`);
  for (const name of ["speech"]) {
    const input = node.inputs[name];
    if (input !== undefined && "value" in input && typeof input.value === "string") sealText(input.value);
  }
  const fields = Object.fromEntries(scalarInputs.flatMap(({ input, field }) => {
    const value = node.inputs[input];
    if (value === undefined) return [];
    assert("value" in value, `${subject} input ${input} must be an authored value.`);
    return [[field, [value.value]]];
  }));
  verifyModelFields(endpoint.fields, fields, { defer: endpoint.fields.fields.map((field) => field.name) });
  return {
    consumedInputs: Object.keys(node.inputs),
    missing: required.filter((name) => node.inputs[name] === undefined),
  };
}

const voiceDesign: GenerationOperationNodeDeclaration = {
  kind: "operation",
  using: mimoSpeechGenerationNodes.voiceDesign,
  output: blobTypes.blob,
  authoring: mimoVoiceDesignAuthoring,
  resolve({ node }) {
    const subject = `MiMo VoiceDesign Node ${node.id}`;
    const endpoint = mimoSpeechEndpoints.voiceDesign;
    const state = resolveInputs(node, endpoint, subject, ["speech", "voiceDescription"], [], [
      { input: "voiceDescription", field: "voiceDescription" },
    ]);
    if (state.missing.length > 0) return { kind: "incomplete" as const, ...state };
    exactInputs(node.inputs, subject, ["speech", "voiceDescription"]);
    return {
      kind: "ready",
      consumedInputs: state.consumedInputs,
      compiled: fieldModelGraphOperation({
        endpoint,
        draft: sealMimoSpeechRequestDraft("mimo-v2.5-tts-voicedesign", {
          voiceDescription: [authoredValue(node.inputs, "voiceDescription", subject) as ModelFieldValue],
        }),
        textFields: [{
          name: "speech",
          field: "text",
          source: textInput(node.inputs.speech!),
        }],
      }),
    };
  },
};

const voiceClone: GenerationOperationNodeDeclaration = {
  kind: "operation",
  using: mimoSpeechGenerationNodes.voiceClone,
  output: blobTypes.blob,
  authoring: mimoVoiceCloneAuthoring,
  resolve({ node }) {
    const subject = `MiMo VoiceClone Node ${node.id}`;
    const endpoint = mimoSpeechEndpoints.voiceClone;
    const state = resolveInputs(node, endpoint, subject, ["speech", "voiceReference"], ["instruction"], [
      { input: "instruction", field: "instruction" },
    ]);
    if (state.missing.length > 0) return { kind: "incomplete" as const, ...state };
    exactInputs(node.inputs, subject, ["speech", "voiceReference"], ["instruction"]);
    const instruction = node.inputs.instruction === undefined
      ? undefined
      : authoredValue(node.inputs, "instruction", subject);
    const artifacts: readonly FieldModelGraphArtifactInput[] = [{
      name: "voice",
      field: "voiceReference",
      role: "audio",
      source: node.inputs.voiceReference!,
    }];
    return {
      kind: "ready",
      consumedInputs: state.consumedInputs,
      compiled: fieldModelGraphOperation({
        endpoint,
        draft: sealMimoSpeechRequestDraft("mimo-v2.5-tts-voiceclone",
          instruction === undefined ? {} : { instruction: [instruction as ModelFieldValue] }),
        artifacts,
        textFields: [{
          name: "speech",
          field: "text",
          source: textInput(node.inputs.speech!),
        }],
      }),
    };
  },
};

export const mimoSpeechGenerationNodeDeclarations: readonly GenerationOperationNodeDeclaration[] = [
  voiceDesign,
  voiceClone,
];
