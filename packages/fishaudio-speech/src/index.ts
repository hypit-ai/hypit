import { sealModelFieldRequest, sealModelFieldBuilder, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const fishAudioSpeechModuleRef = { name: "@hypit/fishaudio-speech", version: "1" } as const;
export const fishAudioSpeechModels = [
  "voice-design-1",
  "voice-clone",
] as const;
export type FishAudioSpeechModel = typeof fishAudioSpeechModels[number];

// Fish Audio documents no fixed character ceiling. Service-side limits stay service-side
// instead of becoming an invented model constraint in Author Source.
const spokenText = { kind: "text" } as const;
const voiceDescription = { kind: "text" } as const;

function table(model: FishAudioSpeechModel): ModelFieldTable {
  if (model === "voice-design-1") {
    return defineModelFields({
      model,
      fields: [
        { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
        { name: "voiceDescription", value: voiceDescription, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  return defineModelFields({
    model,
    fields: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "voiceReference", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const fishAudioSpeechFields: Readonly<Record<FishAudioSpeechModel, ModelFieldTable>> = {
  "voice-design-1": table("voice-design-1"),
  "voice-clone": table("voice-clone"),
};

export function sealFishAudioSpeechRequest(
  model: FishAudioSpeechModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(fishAudioSpeechFields[model], fields);
}

export function sealFishAudioSpeechRequestDraft(
  model: FishAudioSpeechModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
) {
  return sealModelFieldBuilder(fishAudioSpeechFields[model], fields);
}

const base = defineFieldModelModule({
  module: fishAudioSpeechModuleRef,
  endpoints: ([
    ["voiceDesign", "voice-design-1", "FishAudioVoiceDesignRequest"],
    ["voiceClone", "voice-clone", "FishAudioVoiceCloneRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    fields: fishAudioSpeechFields[model],
    result: standardGenerationResults.audio,
  })),
});

export const fishAudioSpeechEndpoints = base.endpoints;

export const fishAudioSpeechManifest = { ...base.manifest } as const;
export const fishAudioSpeechComponent = base.component;
export const fishAudioSpeechDefinition = { ...base, manifest: fishAudioSpeechManifest };

export { createFishAudioSpeechAudioFragment } from "./fragment.js";
