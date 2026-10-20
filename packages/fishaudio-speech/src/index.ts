import { blobTypes } from "@hypit/hypit/blob";
import { sealModelFieldRequest, sealModelFieldBuilder, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/hypit/markup";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";
import { textTypes } from "@hypit/hypit/text";

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
      ports: [
        { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
        { name: "voiceDescription", value: voiceDescription, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  return defineModelFields({
    model,
    ports: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "voiceReference", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const fishAudioSpeechPorts: Readonly<Record<FishAudioSpeechModel, ModelFieldTable>> = {
  "voice-design-1": table("voice-design-1"),
  "voice-clone": table("voice-clone"),
};

export function sealFishAudioSpeechRequest(
  model: FishAudioSpeechModel,
  ports: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(fishAudioSpeechPorts[model], ports);
}

export function sealFishAudioSpeechRequestDraft(
  model: FishAudioSpeechModel,
  ports: Readonly<Record<string, readonly ModelFieldValue[]>>,
) {
  return sealModelFieldBuilder(fishAudioSpeechPorts[model], ports);
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
    ports: fishAudioSpeechPorts[model],
    result: standardGenerationResults.audio,
  })),
});

export const fishAudioSpeechEndpoints = base.endpoints;

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

export const fishAudioSpeechMarkupSurfaces = [
  {
    name: "voiceDesign", tag: "VoiceDesign", mode: "structured",
    outputs: [fishAudioSpeechEndpoints.voiceDesign.draftType],
    vocabulary: {
      summary: "Creates a reusable voice reference from a natural-language voice description.",
      attributes: spokenAttributes,
      ports: referencePort,
      text: "The element's own text is the voice description and is required.",
      example: `<fish:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</fish:VoiceDesign>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "The result is an ordinary audio Resource that can be supplied anywhere an audio reference is accepted.",
      ],
    },
  },
  {
    name: "voiceClone", tag: "VoiceClone", mode: "structured",
    outputs: [
      fishAudioSpeechEndpoints.voiceClone.draftType,
      ...Object.values(fishAudioSpeechEndpoints.voiceClone.mediaBindings).map((binding) => binding.type),
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
      example: `<fish:VoiceClone id="narration" speech={story.segment.reveal.speech} voice={host.reference}/>`,
      notes: [
        "The element takes its spoken words from speech and voice identity from voice; it has no body input.",
        "The voice reference remains a normal audio Resource rather than a separate identity record.",
      ],
    },
  },
] as const;

export const fishAudioSpeechManifest = { ...base.manifest } as const;
export const fishAudioSpeechComponent = base.component;
export const fishAudioSpeechDefinition = { ...base, manifest: fishAudioSpeechManifest };

export { createFishAudioSpeechAudioFragment } from "./fragment.js";
export { decodeFishAudioVoiceCloneSurface, decodeFishAudioVoiceDesignSurface } from "./surface.js";
