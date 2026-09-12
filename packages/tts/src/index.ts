import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const ttsModuleRef = { name: "@hypit/tts", version: "1" } as const;
export const ttsModels = [
  "mimo-v2.5-tts-voicedesign",
  "eleven_ttv_v3",
  "mimo-v2.5-tts-voiceclone",
] as const;
export type TtsModel = typeof ttsModels[number];

// Neither vendor documents a fixed character ceiling. Service-side limits stay service-side
// instead of becoming an invented model constraint in Author Source.
const spokenText = { kind: "text" } as const;
const instruction = { kind: "text" } as const;

function table(model: TtsModel): GenerationPortTable {
  if (model === "mimo-v2.5-tts-voicedesign" || model === "eleven_ttv_v3") {
    return sealGenerationPortTable({
      model,
      result: "audio",
      ports: [
        { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
        { name: "voiceDescription", value: instruction, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  return sealGenerationPortTable({
    model,
    result: "audio",
    ports: [
      { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
      { name: "instruction", value: instruction, minItems: 0, maxItems: 1 },
      { name: "voiceReference", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const ttsPorts: Readonly<Record<TtsModel, GenerationPortTable>> = {
  "mimo-v2.5-tts-voicedesign": table("mimo-v2.5-tts-voicedesign"),
  "eleven_ttv_v3": table("eleven_ttv_v3"),
  "mimo-v2.5-tts-voiceclone": table("mimo-v2.5-tts-voiceclone"),
};

export function sealTtsRequest(
  model: TtsModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(ttsPorts[model], ports);
}

export function sealTtsRequestDraft(
  model: TtsModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(ttsPorts[model], ports);
}

const base = defineExactModelModule({
  module: ttsModuleRef,
  endpoints: ([
    ["voiceDesign", "mimo-v2.5-tts-voicedesign", "MimoVoiceDesignRequest"],
    ["elevenVoiceDesign", "eleven_ttv_v3", "ElevenVoiceDesignRequest"],
    ["voiceClone", "mimo-v2.5-tts-voiceclone", "MimoVoiceCloneRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    ports: ttsPorts[model],
  })),
});

export const ttsEndpoints = base.endpoints;
export const voiceDesignEndpoints = {
  "mimo-v2.5-tts-voicedesign": ttsEndpoints.voiceDesign,
  "eleven_ttv_v3": ttsEndpoints.elevenVoiceDesign,
} as const;
export type VoiceDesignModel = keyof typeof voiceDesignEndpoints;

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
  type: artifactTypes.blob,
  summary: "The designed voice reference, addressed as `<id>.reference`.",
}];

const audioPort: readonly SurfacePortVocabulary[] = [{
  name: "audio",
  type: artifactTypes.blob,
  summary: "The independent speech, addressed as `<id>.audio`.",
}];

export const ttsMarkupSurfaces = [
  {
    name: "voiceDesign", tag: "VoiceDesign", mode: "structured",
    outputs: Object.values(voiceDesignEndpoints).map((endpoint) => endpoint.draftType),
    vocabulary: {
      summary: "Creates a reusable voice reference from a natural-language voice description.",
      attributes: [
        ...spokenAttributes,
        {
          name: "model",
          kind: "literal",
          required: false,
          summary: "Chooses the exact voice design model; ElevenLabs when omitted.",
          values: ["mimo", "mimo-v2.5-tts-voicedesign", "eleven", "eleven_ttv_v3"],
        },
      ],
      ports: referencePort,
      text: "The element's own text is the voice description and is required.",
      example: `<tts:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</tts:VoiceDesign>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "The result is an ordinary audio Resource that can be supplied anywhere an audio reference is accepted.",
      ],
    },
  },
  {
    name: "voiceClone", tag: "VoiceClone", mode: "structured",
    outputs: [
      ttsEndpoints.voiceClone.draftType,
      ...Object.values(ttsEndpoints.voiceClone.mediaBindings).map((binding) => binding.type),
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
          accepts: [artifactTypes.blob],
        },
      ],
      ports: audioPort,
      text: "The element's own text is an optional delivery instruction.",
      example: `<tts:VoiceClone id="narration" speech={story.segment.reveal.speech} voice={host.reference}>
  Quietly confident, with a short pause before the final word.
</tts:VoiceClone>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "The voice reference remains a normal audio Resource rather than a separate identity record.",
      ],
    },
  },
] as const;

export const ttsManifest = { ...base.manifest } as const;
export const ttsComponent = base.component;
export const ttsDefinition = { ...base, manifest: ttsManifest };

export { createTtsAudioFragment } from "./fragment.js";
export { decodeVoiceCloneSurface, decodeVoiceDesignSurface } from "./surface.js";
