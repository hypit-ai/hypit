import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const elevenLabsSpeechModuleRef = { name: "@hypit/elevenlabs-speech", version: "1" } as const;
export const elevenLabsSpeechModels = ["eleven_ttv_v3"] as const;
export type ElevenLabsSpeechModel = typeof elevenLabsSpeechModels[number];

// ElevenLabs documents a 100 to 1000 character preview text. The port vocabulary
// carries the ceiling; the floor is stated to authors and enforced by the service.
const spokenText = { kind: "text", maxChars: 1000 } as const;
const instruction = { kind: "text" } as const;

function table(model: ElevenLabsSpeechModel): GenerationPortTable {
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

export const elevenLabsSpeechPorts: Readonly<Record<ElevenLabsSpeechModel, GenerationPortTable>> = {
  "eleven_ttv_v3": table("eleven_ttv_v3"),
};

export function sealElevenLabsSpeechRequest(
  model: ElevenLabsSpeechModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(elevenLabsSpeechPorts[model], ports);
}

export function sealElevenLabsSpeechRequestDraft(
  model: ElevenLabsSpeechModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
) {
  return sealGenerationRequestDraft(elevenLabsSpeechPorts[model], ports);
}

const base = defineExactModelModule({
  module: elevenLabsSpeechModuleRef,
  endpoints: ([
    ["voiceDesign", "eleven_ttv_v3", "ElevenLabsVoiceDesignRequest"],
  ] as const).map(([key, model, requestTypeName]) => ({
    key,
    requestTypeName,
    producerName: `request-${model}`,
    ports: elevenLabsSpeechPorts[model],
  })),
});

export const elevenLabsSpeechEndpoints = base.endpoints;

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

export const elevenLabsSpeechMarkupSurfaces = [
  {
    name: "voiceDesign", tag: "VoiceDesign", mode: "structured",
    outputs: [elevenLabsSpeechEndpoints.voiceDesign.draftType],
    vocabulary: {
      summary: "Creates a reusable voice reference from a natural-language voice description.",
      attributes: spokenAttributes,
      ports: referencePort,
      text: "The element's own text is the voice description and is required.",
      example: `<eleven:VoiceDesign id="host" speech={story.segment.voiceSample.speech}>
  A clear young woman with a grounded, confident conversational delivery.
</eleven:VoiceDesign>`,
      notes: [
        "The element accepts no child elements; only its text is read.",
        "The spoken sample must be between 100 and 1000 characters.",
        "The result is an ordinary audio Resource that can be supplied anywhere an audio reference is accepted.",
      ],
    },
  },
] as const;

export const elevenLabsSpeechManifest = { ...base.manifest } as const;
export const elevenLabsSpeechComponent = base.component;
export const elevenLabsSpeechDefinition = { ...base, manifest: elevenLabsSpeechManifest };

export { createElevenLabsSpeechAudioFragment } from "./fragment.js";
export { decodeElevenLabsVoiceDesignSurface } from "./surface.js";
