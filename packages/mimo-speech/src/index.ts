import { sealModelFieldRequest, sealModelFieldBuilder, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const mimoSpeechModuleRef = { name: "@hypit/mimo-speech", version: "1" } as const;
export const mimoSpeechModels = [
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts-voiceclone",
] as const;
export type MimoSpeechModel = typeof mimoSpeechModels[number];

// Xiaomi documents no fixed character ceiling. Service-side limits stay service-side
// instead of becoming an invented model constraint in Author Source.
const spokenText = { kind: "text" } as const;
const instruction = { kind: "text" } as const;

function table(model: MimoSpeechModel): ModelFieldTable {
  if (model === "mimo-v2.5-tts-voicedesign") {
    return defineModelFields({
      model,
      fields: [
        { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
        { name: "voiceDescription", value: instruction, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  return defineModelFields({
    model,
    fields: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "instruction", value: instruction, minItems: 0, maxItems: 1 },
      { name: "voiceReference", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const mimoSpeechFields: Readonly<Record<MimoSpeechModel, ModelFieldTable>> = {
  "mimo-v2.5-tts-voicedesign": table("mimo-v2.5-tts-voicedesign"),
  "mimo-v2.5-tts-voiceclone": table("mimo-v2.5-tts-voiceclone"),
};

export function sealMimoSpeechRequest(
  model: MimoSpeechModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(mimoSpeechFields[model], fields);
}

export function sealMimoSpeechRequestDraft(
  model: MimoSpeechModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
) {
  return sealModelFieldBuilder(mimoSpeechFields[model], fields);
}

const base = defineFieldModelModule({
  module: mimoSpeechModuleRef,
  endpoints: ([
    ["voiceDesign", "mimo-v2.5-tts-voicedesign", "MimoVoiceDesignRequest"],
    ["voiceClone", "mimo-v2.5-tts-voiceclone", "MimoVoiceCloneRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    fields: mimoSpeechFields[model],
    result: standardGenerationResults.audio,
  })),
});

export const mimoSpeechEndpoints = base.endpoints;

export const mimoSpeechManifest = { ...base.manifest } as const;
export const mimoSpeechComponent = base.component;
export const mimoSpeechDefinition = { ...base, manifest: mimoSpeechManifest };

export { createMimoSpeechAudioFragment } from "./fragment.js";
