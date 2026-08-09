import { sealGenerationPortRequest, sealGenerationRequestDraft, sealGenerationPortTable } from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { narrativeDependency } from "@narratage/narrative";
import { digestOf } from "@narratage/protocol";

export const mimoTtsModuleRef = { name: "@narratage/mimo-tts", version: "1" } as const;
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
      contract: "svml.generation-ports@1", model, result: "audio",
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
      contract: "svml.generation-ports@1", model, result: "audio",
      ports: [
        ...common,
        { name: "voiceDescription", value: instruction, minItems: 1, maxItems: 1 },
      ],
      requires: [],
    });
  }
  return sealGenerationPortTable({
    contract: "svml.generation-ports@1", model, result: "audio",
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
export const mimoTtsSurfaceDigests = {
  preset: digestOf("@narratage/mimo-tts/preset-surface@1"),
  voiceDesign: digestOf("@narratage/mimo-tts/voice-design-surface@1"),
  voiceClone: digestOf("@narratage/mimo-tts/voice-clone-surface@1"),
} as const;

export const mimoTtsManifest = {
  ...base.manifest,
  dependencies: [...base.manifest.dependencies, narrativeDependency],
  surfaces: [
    {
      name: "preset", tag: "Preset", mode: "structured",
      outputs: [mimoTtsEndpoints.preset.draftType],
      implementation: {
        kind: "trusted-frontend-surface" as const,
        locator: "@narratage/mimo-tts/preset-surface",
        digest: mimoTtsSurfaceDigests.preset,
      },
    },
    {
      name: "voiceDesign", tag: "VoiceDesign", mode: "structured",
      outputs: [mimoTtsEndpoints.voiceDesign.draftType],
      implementation: {
        kind: "trusted-frontend-surface" as const,
        locator: "@narratage/mimo-tts/voice-design-surface",
        digest: mimoTtsSurfaceDigests.voiceDesign,
      },
    },
    {
      name: "voiceClone", tag: "VoiceClone", mode: "structured",
      outputs: [
        mimoTtsEndpoints.voiceClone.draftType,
        ...Object.values(mimoTtsEndpoints.voiceClone.mediaBindings).map((binding) => binding.type),
      ],
      implementation: {
        kind: "trusted-frontend-surface" as const,
        locator: "@narratage/mimo-tts/voice-clone-surface",
        digest: mimoTtsSurfaceDigests.voiceClone,
      },
    },
  ],
} as const;

export const mimoTtsManifestDigest = digestOf(mimoTtsManifest);
export const mimoTtsComponent = base.component;

export { createMimoTtsAudioFragment } from "./fragment.js";
export {
  decodeMimoPresetSurface,
  decodeMimoVoiceCloneSurface,
  decodeMimoVoiceDesignSurface,
} from "./surface.js";
