import { sealModelFieldRequest, sealModelFieldBuilder, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const elevenLabsSpeechModuleRef = { name: "@hypit/elevenlabs-speech", version: "1" } as const;
export const elevenLabsSpeechModels = ["eleven_ttv_v3"] as const;
export type ElevenLabsSpeechModel = typeof elevenLabsSpeechModels[number];

// ElevenLabs documents a 100 to 1000 character preview text. The field vocabulary
// carries the ceiling; the floor is stated to authors and enforced by the service.
const spokenText = { kind: "text", maxChars: 1000 } as const;
// Voice descriptions have their own documented 20 to 1000 character bounds.
const instruction = { kind: "text", maxChars: 1000 } as const;

function table(model: ElevenLabsSpeechModel): ModelFieldTable {
  return defineModelFields({
    model,
    fields: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "voiceDescription", value: instruction, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const elevenLabsSpeechFields: Readonly<Record<ElevenLabsSpeechModel, ModelFieldTable>> = {
  "eleven_ttv_v3": table("eleven_ttv_v3"),
};

export function sealElevenLabsSpeechRequest(
  model: ElevenLabsSpeechModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(elevenLabsSpeechFields[model], fields);
}

export function sealElevenLabsSpeechRequestDraft(
  model: ElevenLabsSpeechModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
) {
  return sealModelFieldBuilder(elevenLabsSpeechFields[model], fields);
}

const base = defineFieldModelModule({
  module: elevenLabsSpeechModuleRef,
  endpoints: ([
    ["voiceDesign", "eleven_ttv_v3", "ElevenLabsVoiceDesignRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    fields: elevenLabsSpeechFields[model],
    result: standardGenerationResults.audio,
  })),
});

export const elevenLabsSpeechEndpoints = base.endpoints;

export const elevenLabsSpeechManifest = { ...base.manifest } as const;
export const elevenLabsSpeechComponent = base.component;
export const elevenLabsSpeechDefinition = { ...base, manifest: elevenLabsSpeechManifest };

export { createElevenLabsSpeechAudioFragment } from "./fragment.js";
