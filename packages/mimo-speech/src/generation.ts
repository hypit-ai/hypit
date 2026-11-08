import type {
  GenerationGraphInput,
  GenerationOperationNodeDeclaration,
} from "@hypit/hypit/generation-graph";
import { canonicalize, type CanonicalValue } from "@hypit/hypit/protocol";
import { sealText } from "@hypit/hypit/text";
import {
  fieldModelGraphOperation,
  type FieldModelGraphArtifactInput,
} from "@hypit/generation/model-fields/graph";
import type { ModelFieldValue } from "@hypit/generation/model-fields";

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

const voiceDesign: GenerationOperationNodeDeclaration = {
  kind: "operation",
  using: mimoSpeechGenerationNodes.voiceDesign,
  compile({ node }) {
    const subject = `MiMo VoiceDesign Node ${node.id}`;
    exactInputs(node.inputs, subject, ["speech", "voiceDescription"]);
    return fieldModelGraphOperation({
      endpoint: mimoSpeechEndpoints.voiceDesign,
      draft: sealMimoSpeechRequestDraft("mimo-v2.5-tts-voicedesign", {
        voiceDescription: [authoredValue(node.inputs, "voiceDescription", subject) as ModelFieldValue],
      }),
      textFields: [{
        name: "speech",
        field: "text",
        source: textInput(node.inputs.speech!),
      }],
    });
  },
};

const voiceClone: GenerationOperationNodeDeclaration = {
  kind: "operation",
  using: mimoSpeechGenerationNodes.voiceClone,
  compile({ node }) {
    const subject = `MiMo VoiceClone Node ${node.id}`;
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
    return fieldModelGraphOperation({
      endpoint: mimoSpeechEndpoints.voiceClone,
      draft: sealMimoSpeechRequestDraft("mimo-v2.5-tts-voiceclone",
        instruction === undefined ? {} : { instruction: [instruction as ModelFieldValue] }),
      artifacts,
      textFields: [{
        name: "speech",
        field: "text",
        source: textInput(node.inputs.speech!),
      }],
    });
  },
};

export const mimoSpeechGenerationNodeDeclarations: readonly GenerationOperationNodeDeclaration[] = [
  voiceDesign,
  voiceClone,
];
