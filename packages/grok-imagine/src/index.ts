import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const grokImagineModuleRef = { name: "@hypit/grok-imagine", version: "1" } as const;
export const grokImagineModels = ["grok-imagine-video", "grok-imagine-video-1.5-preview"] as const;
export type GrokImagineModel = typeof grokImagineModels[number];

export const grokImagineVideoFields: ModelFieldTable = defineModelFields({
  model: "grok-imagine-video",
  fields: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 6, maximum: 30 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 7 },
  ],
  requires: [],
});

export const grokImagine15PreviewFields: ModelFieldTable = defineModelFields({
  model: "grok-imagine-video-1.5-preview",
  fields: [
    { name: "prompt", value: { kind: "text", maxChars: 4_096 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["auto", "2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 1, maximum: 15 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 7 },
  ],
  requires: [],
});

export const grokImagineFields: Readonly<Record<GrokImagineModel, ModelFieldTable>> = {
  "grok-imagine-video": grokImagineVideoFields,
  "grok-imagine-video-1.5-preview": grokImagine15PreviewFields,
};

export function sealGrokImagineRequest(
  model: GrokImagineModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(grokImagineFields[model], fields);
}

const grokImagineBaseDefinition = defineFieldModelModule({
  module: grokImagineModuleRef,
  endpoints: [
    {
      key: "video",
      requestTypeName: "GrokImagineVideoRequest",
      producerName: "request-grok-imagine-video",
      fields: grokImagineVideoFields,
      result: standardGenerationResults.video,
    },
    {
      key: "preview-1.5",
      requestTypeName: "GrokImagine15PreviewRequest",
      producerName: "request-grok-imagine-preview-1-5",
      fields: grokImagine15PreviewFields,
      result: standardGenerationResults.video,
    },
  ],
});

export const grokImagineEndpoints = grokImagineBaseDefinition.endpoints;
export const grokImagineComponent = grokImagineBaseDefinition.component;

export const grokImagineManifest = {
  ...grokImagineBaseDefinition.manifest,
};
export const grokImagineDefinition = {
  ...grokImagineBaseDefinition,
  manifest: grokImagineManifest,
};
