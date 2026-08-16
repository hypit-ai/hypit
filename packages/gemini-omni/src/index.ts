import { sealGenerationPortRequest, sealGenerationPortTable } from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";

export const geminiOmniModuleRef = { name: "@narratage/gemini-omni", version: "1" } as const;

export const geminiOmniVideoPorts: GenerationPortTable = sealGenerationPortTable({
  model: "gemini-omni-video",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "enum", values: [4, 6, 8, 10] }, minItems: 1, maxItems: 1 },
    { name: "aspectRatio", value: { kind: "enum", values: ["16:9", "9:16"] }, minItems: 1, maxItems: 1 },
    { name: "resolution", value: { kind: "enum", values: ["720p", "1080p", "4k"] }, minItems: 1, maxItems: 1 },
    {
      name: "seed",
      value: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 },
      minItems: 0,
      maxItems: 1,
    },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 7 },
    {
      name: "excerpts",
      value: {
        kind: "media",
        accepts: ["video"],
        itemFields: [
          { name: "startSec", value: { kind: "number", minimum: 0 } },
          { name: "endSec", value: { kind: "number", minimum: 0 } },
        ],
        itemRequires: [{ kind: "strictlyIncreasing", fields: ["startSec", "endSec"] }],
      },
      minItems: 0,
      maxItems: 1,
    },
    { name: "audioIds", value: { kind: "token", minLength: 1, maxLength: 255 }, minItems: 0, maxItems: 3 },
    { name: "characterIds", value: { kind: "token", minLength: 1, maxLength: 255 }, minItems: 0, maxItems: 3 },
  ],
  /** One shared reference budget; a video excerpt costs twice an image. */
  requires: [{
    kind: "weightedTotal",
    weights: { images: 1, excerpts: 2, characterIds: 1 },
    maximum: 7,
  }],
});

export function sealGeminiOmniRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(geminiOmniVideoPorts, ports);
}

const geminiOmniBaseDefinition = defineExactModelModule({
  module: geminiOmniModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "GeminiOmniVideoRequest",
    producerName: "request-gemini-omni-video",
    ports: geminiOmniVideoPorts,
  }],
});

export const geminiOmniEndpoints = geminiOmniBaseDefinition.endpoints;
export const geminiOmniComponent = geminiOmniBaseDefinition.component;
const geminiOmniEndpoint = geminiOmniEndpoints.video!;

export const geminiOmniMarkupSurfaces = [{
    name: "video",
    tag: "Video",
    mode: "structured" as const,
    outputs: [
      geminiOmniEndpoint.draftType,
      geminiOmniEndpoint.mediaBindings.images!.type,
      geminiOmniEndpoint.mediaBindings.excerpts!.type,
    ],
  }] as const;

export const geminiOmniManifest = {
  ...geminiOmniBaseDefinition.manifest,
};
export const geminiOmniDefinition = {
  ...geminiOmniBaseDefinition,
  manifest: geminiOmniManifest,
};
