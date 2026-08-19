import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const mimoTtsModuleRef = { name: "@hypit/mimo-tts", version: "1" } as const;
export const mimoTtsModels = [
  "mimo-v2.5-tts",
  "mimo-v2.5-tts-voicedesign",
  "mimo-v2.5-tts-voiceclone",
] as const;
export type MimoTtsModel = typeof mimoTtsModels[number];

export const mimoPresetVoices = ["冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"] as const;
export type MimoPresetVoice = typeof mimoPresetVoices[number];

// Xiaomi documents no fixed character ceiling. Service-side limits stay service-side
// instead of becoming an invented model constraint in Author Source.
const spokenText = { kind: "text" } as const;
const instruction = { kind: "text" } as const;

function table(model: MimoTtsModel): GenerationPortTable {
  const common = [
    { name: "text", value: spokenText, minItems: 1, maxItems: 1 },
  ] as const;
  if (model === "mimo-v2.5-tts") {
    return sealGenerationPortTable({
      model, result: "audio",
      ports: [
        ...common,
        { name: "instruction", value: instruction, minItems: 0, maxItems: 1 },
        { name: "voice", value: { kind: "enum", values: [...mimoPresetVoices] }, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  if (model === "mimo-v2.5-tts-voicedesign") {
    return sealGenerationPortTable({
      model, result: "audio",
      ports: [
        ...common,
        { name: "voiceDescription", value: instruction, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  return sealGenerationPortTable({
    model, result: "audio",
    ports: [
      ...common,
      { name: "instruction", value: instruction, minItems: 0, maxItems: 1 },
      { name: "sample", value: { kind: "media", accepts: ["audio"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const mimoTtsPorts: Readonly<Record<MimoTtsModel, GenerationPortTable>> = {
  "mimo-v2.5-tts": table("mimo-v2.5-tts"),
  "mimo-v2.5-tts-voicedesign": table("mimo-v2.5-tts-voicedesign"),
  "mimo-v2.5-tts-voiceclone": table("mimo-v2.5-tts-voiceclone"),
};

export function sealMimoTtsRequest(
  model: MimoTtsModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(mimoTtsPorts[model], ports);
}

export function sealMimoTtsRequestDraft(
  model: MimoTtsModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(mimoTtsPorts[model], ports);
}

const base = defineExactModelModule({
  module: mimoTtsModuleRef,
  endpoints: ([
    ["preset", "mimo-v2.5-tts", "MimoPresetTtsRequest"],
    ["voiceDesign", "mimo-v2.5-tts-voicedesign", "MimoVoiceDesignTtsRequest"],
    ["voiceClone", "mimo-v2.5-tts-voiceclone", "MimoVoiceCloneTtsRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    ports: mimoTtsPorts[model],
  })),
});

export const mimoTtsEndpoints = base.endpoints;

const mimoSpokenAttributes: readonly SurfaceAttributeVocabulary[] = [
  {
    name: "id",
    kind: "identifier",
    required: true,
    summary: "Names this synthesis and prefixes the bindings it publishes.",
  },
  {
    name: "speech",
    kind: "reference",
    required: true,
    summary: "The Text edge whose exact words the model speaks.",
    accepts: [textTypes.text],
  },
];

const mimoAudioPort: readonly SurfacePortVocabulary[] = [{
  name: "audio",
  type: artifactTypes.blob,
  summary: "The synthesized speech, addressed as `<id>.audio`.",
}];

export const mimoTtsMarkupSurfaces = [
  {
    name: "preset", tag: "Preset", mode: "structured",
    outputs: [mimoTtsEndpoints.preset.draftType],
    vocabulary: {
      summary: "Speaks a Text with one of the built-in MiMo voices.",
      attributes: [
        ...mimoSpokenAttributes,
        {
          name: "voice",
          kind: "literal",
          required: true,
          summary: "The built-in voice that reads the speech.",
          values: mimoPresetVoices,
        },
      ],
      ports: mimoAudioPort,
      text: "The element's own text is an optional delivery instruction; leaving it empty sends no instruction.",
      example: `<mimo:Preset id="narration" speech={story.segment.opening.speech} voice="Chloe">
  Warm, direct and conversational.
</mimo:Preset>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "`speech` stays an ordinary Text edge attached at execution time, so the Frontend copies no Script words into the request draft.",
      ],
    },
  },
  {
    name: "voiceDesign", tag: "VoiceDesign", mode: "structured",
    outputs: [mimoTtsEndpoints.voiceDesign.draftType],
    vocabulary: {
      summary: "Speaks a Text with a voice the element describes in words rather than names.",
      attributes: mimoSpokenAttributes,
      ports: mimoAudioPort,
      text: "The element's own text is the voice description and is required.",
      example: `<mimo:VoiceDesign id="designed" speech={story.segment.answer.speech}>
  A clear young woman with a grounded, confident delivery.
</mimo:VoiceDesign>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "An empty body is refused, because this model has no voice to fall back on.",
      ],
    },
  },
  {
    name: "voiceClone", tag: "VoiceClone", mode: "structured",
    outputs: [
      mimoTtsEndpoints.voiceClone.draftType,
      ...Object.values(mimoTtsEndpoints.voiceClone.mediaBindings).map((binding) => binding.type),
    ],
    vocabulary: {
      summary: "Speaks a Text with the voice heard in one audio Artifact.",
      attributes: [
        ...mimoSpokenAttributes,
        {
          name: "sample",
          kind: "reference",
          required: true,
          summary: "The audio Artifact whose voice the model reproduces.",
          accepts: [artifactTypes.blob],
        },
      ],
      ports: mimoAudioPort,
      text: "The element's own text is an optional delivery instruction; leaving it empty sends no instruction.",
      example: `<mimo:VoiceClone id="cloned" speech={story.segment.payoff.speech} sample={presenter.audio}>
  Calm and restrained.
</mimo:VoiceClone>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "An authored `sample` whose media type is not audio is refused before any Need exists.",
      ],
    },
  },
] as const;

export const mimoTtsManifest = {
  ...base.manifest,
} as const;

export const mimoTtsComponent = base.component;

export { createMimoTtsAudioFragment } from "./fragment.js";
export {
  decodeMimoPresetSurface,
  decodeMimoVoiceCloneSurface,
  decodeMimoVoiceDesignSurface,
} from "./surface.js";
