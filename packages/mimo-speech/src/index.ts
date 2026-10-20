import { blobTypes } from "@hypit/hypit/blob";
import { sealModelFieldRequest, sealModelFieldBuilder, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/hypit/markup";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";
import { textTypes } from "@hypit/hypit/text";

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
      ports: [
        { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
        { name: "voiceDescription", value: instruction, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  return defineModelFields({
    model,
    ports: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "instruction", value: instruction, minItems: 0, maxItems: 1 },
      { name: "voiceReference", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const mimoSpeechPorts: Readonly<Record<MimoSpeechModel, ModelFieldTable>> = {
  "mimo-v2.5-tts-voicedesign": table("mimo-v2.5-tts-voicedesign"),
  "mimo-v2.5-tts-voiceclone": table("mimo-v2.5-tts-voiceclone"),
};

export function sealMimoSpeechRequest(
  model: MimoSpeechModel,
  ports: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(mimoSpeechPorts[model], ports);
}

export function sealMimoSpeechRequestDraft(
  model: MimoSpeechModel,
  ports: Readonly<Record<string, readonly ModelFieldValue[]>>,
) {
  return sealModelFieldBuilder(mimoSpeechPorts[model], ports);
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
    ports: mimoSpeechPorts[model],
    result: standardGenerationResults.audio,
  })),
});

export const mimoSpeechEndpoints = base.endpoints;

const spokenAttributes: readonly SurfaceAttributeVocabulary[] = [
  {
    name: "id",
    kind: "identifier",
    required: true,
    summary: "Names this speech request and prefixes the binding it publishes.",
  },
  {
    name: "speech",
    kind: "reference",
    required: true,
    summary: "The Text edge whose exact words are spoken.",
    accepts: [textTypes.text],
  },
];

const referencePort: readonly SurfacePortVocabulary[] = [{
  name: "reference",
  type: blobTypes.blob,
  summary: "The designed voice reference, addressed as `<id>.reference`.",
}];

const audioPort: readonly SurfacePortVocabulary[] = [{
  name: "audio",
  type: blobTypes.blob,
  summary: "The independent speech, addressed as `<id>.audio`.",
}];

export const mimoSpeechMarkupSurfaces = [
  {
    name: "voiceDesign", tag: "VoiceDesign", mode: "structured",
    outputs: [mimoSpeechEndpoints.voiceDesign.draftType],
    vocabulary: {
      summary: "Creates a reusable voice reference from a natural-language voice description.",
      attributes: spokenAttributes,
      ports: referencePort,
      text: "The element's own text is the voice description and is required.",
      example: `<mimo:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</mimo:VoiceDesign>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "The result is an ordinary audio Resource that can be supplied anywhere an audio reference is accepted.",
      ],
    },
  },
  {
    name: "voiceClone", tag: "VoiceClone", mode: "structured",
    outputs: [
      mimoSpeechEndpoints.voiceClone.draftType,
      ...Object.values(mimoSpeechEndpoints.voiceClone.mediaBindings).map((binding) => binding.type),
    ],
    vocabulary: {
      summary: "Creates independent speech in the voice heard in one accepted audio reference.",
      attributes: [
        ...spokenAttributes,
        {
          name: "voice",
          kind: "reference",
          required: true,
          summary: "The audio Resource carrying the voice identity to reproduce.",
          accepts: [blobTypes.blob],
        },
      ],
      ports: audioPort,
      text: "The element's own text is an optional delivery instruction.",
      example: `<mimo:VoiceClone id="narration" speech={story.segment.reveal.speech} voice={host.reference}>
  Quietly confident, with a short pause before the final word.
</mimo:VoiceClone>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "The voice reference remains a normal audio Resource rather than a separate identity record.",
      ],
    },
  },
] as const;

export const mimoSpeechManifest = { ...base.manifest } as const;
export const mimoSpeechComponent = base.component;
export const mimoSpeechDefinition = { ...base, manifest: mimoSpeechManifest };

export { createMimoSpeechAudioFragment } from "./fragment.js";
export { decodeMimoVoiceCloneSurface, decodeMimoVoiceDesignSurface } from "./surface.js";
