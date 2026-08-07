import { sealGenerationPortRequest, sealGenerationPortTable } from "@narratage/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";

export const grokImagineModuleRef = { name: "@narratage/grok-imagine", version: "0.0.0-dev" } as const;
export const grokImagineModels = ["grok-imagine-video", "grok-imagine-video-1.5-preview"] as const;
export type GrokImagineModel = typeof grokImagineModels[number];

export const grokImagineVideoPorts: GenerationPortTable = sealGenerationPortTable({
  contract: "svml.generation-ports@1",
  model: "grok-imagine-video",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 6, maximum: 30 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 4 },
    /** Continues an earlier generation; only meaningful beside its source images. */
    { name: "sourceTaskId", value: { kind: "token", minLength: 1, maxLength: 255 }, minItems: 0, maxItems: 1 },
  ],
  requires: [{ kind: "requiresPresent", port: "sourceTaskId", needs: ["images"] }],
});

export const grokImagine15PreviewPorts: GenerationPortTable = sealGenerationPortTable({
  contract: "svml.generation-ports@1",
  model: "grok-imagine-video-1.5-preview",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 6, maximum: 30 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 4 },
  ],
  requires: [],
});

export const grokImaginePorts: Readonly<Record<GrokImagineModel, GenerationPortTable>> = {
  "grok-imagine-video": grokImagineVideoPorts,
  "grok-imagine-video-1.5-preview": grokImagine15PreviewPorts,
};

export function sealGrokImagineRequest(
  model: GrokImagineModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(grokImaginePorts[model], ports);
}

export const grokImagineDefinition = defineExactModelModule({
  module: grokImagineModuleRef,
  endpoints: [
    {
      key: "video",
      requestTypeName: "GrokImagineVideoRequest",
      producerName: "request-grok-imagine-video",
      ports: grokImagineVideoPorts,
    },
    {
      key: "preview-1.5",
      requestTypeName: "GrokImagine15PreviewRequest",
      producerName: "request-grok-imagine-preview-1-5",
      ports: grokImagine15PreviewPorts,
    },
  ],
});

export const grokImagineManifest = grokImagineDefinition.manifest;
export const grokImagineManifestDigest = grokImagineDefinition.manifestDigest;
export const grokImagineEndpoints = grokImagineDefinition.endpoints;
export const grokImagineComponent = grokImagineDefinition.component;
