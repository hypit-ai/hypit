import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const mimoTtsModuleRef = { name: "@hypit/mimo-tts", version: "1" } as const;
export const mimoTtsModels = ["mimo-v2.5-tts-voicedesign"] as const;
export type MimoTtsModel = typeof mimoTtsModels[number];

// Xiaomi documents no fixed character ceiling. Service-side limits stay service-side
// instead of becoming an invented model constraint in Author Source.
const spokenText = { kind: "text" } as const;
const instruction = { kind: "text" } as const;

function table(model: MimoTtsModel): GenerationPortTable {
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

export const mimoTtsPorts: Readonly<Record<MimoTtsModel, GenerationPortTable>> = {
  "mimo-v2.5-tts-voicedesign": table("mimo-v2.5-tts-voicedesign"),
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
  endpoints: [{
    key: "voiceDesign",
    requestTypeName: "MimoVoiceDesignTtsRequest",
    producerName: "request-mimo-v2.5-tts-voicedesign",
    ports: mimoTtsPorts["mimo-v2.5-tts-voicedesign"],
  }],
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

export const mimoTtsMarkupSurfaces = [{
  name: "voiceDesign", tag: "VoiceDesign", mode: "structured",
  outputs: [mimoTtsEndpoints.voiceDesign.draftType],
  vocabulary: {
    summary: "Speaks a Text with a voice described in natural language.",
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
}] as const;

export const mimoTtsManifest = { ...base.manifest } as const;
export const mimoTtsComponent = base.component;
export const mimoTtsDefinition = { ...base, manifest: mimoTtsManifest };

export { createMimoTtsAudioFragment } from "./fragment.js";
export { decodeMimoVoiceDesignSurface } from "./surface.js";
