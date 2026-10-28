import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const nanoBananaModuleRef = { name: "@hypit/nano-banana", version: "1" } as const;
export const nanoBananaModels = ["nano-banana-2", "nano-banana-pro"] as const;
export type NanoBananaModel = typeof nanoBananaModels[number];

const NANO_BANANA_2_RATIOS = ["auto", "1:1", "2:3", "3:2", "1:4", "4:1", "3:4", "4:3", "4:5",
  "5:4", "1:8", "8:1", "9:16", "16:9", "21:9"] as const;
const NANO_BANANA_PRO_RATIOS = ["auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5",
  "5:4", "9:16", "16:9", "21:9"] as const;

function nanoBananaFieldTable(model: NanoBananaModel): ModelFieldTable {
  const pro = model === "nano-banana-pro";
  return defineModelFields({
    model,
    fields: [
      { name: "prompt", value: { kind: "text", maxChars: pro ? 10_000 : 20_000 }, minItems: 1, maxItems: 1 },
      { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: pro ? 8 : 14 },
      {
        name: "aspectRatio",
        value: {
          kind: "enum",
          values: pro ? [...NANO_BANANA_PRO_RATIOS] : [...NANO_BANANA_2_RATIOS],
        },
        minItems: 1,
        maxItems: 1,
      },
      { name: "resolution", value: { kind: "enum", values: ["1K", "2K", "4K"] }, minItems: 1, maxItems: 1 },
      { name: "outputFormat", value: { kind: "enum", values: ["png", "jpg"] }, minItems: 1, maxItems: 1 },
    ],
    requires: [],
  });
}

export const nanoBananaFields: Readonly<Record<NanoBananaModel, ModelFieldTable>> = {
  "nano-banana-2": nanoBananaFieldTable("nano-banana-2"),
  "nano-banana-pro": nanoBananaFieldTable("nano-banana-pro"),
};

export function sealNanoBananaRequest(
  model: NanoBananaModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(nanoBananaFields[model], fields);
}

const nanoBananaBaseDefinition = defineFieldModelModule({
  module: nanoBananaModuleRef,
  endpoints: nanoBananaModels.map((model) => ({
    key: model === "nano-banana-2" ? "v2" : "pro",
    requestTypeName: model === "nano-banana-2" ? "NanoBanana2Request" : "NanoBananaProRequest",
    producerName: `request-${model}`,
    fields: nanoBananaFields[model],
    result: standardGenerationResults.image,
  })),
});

export const nanoBananaEndpoints = nanoBananaBaseDefinition.endpoints;
export const nanoBananaComponent = nanoBananaBaseDefinition.component;

export const nanoBananaManifest = {
  ...nanoBananaBaseDefinition.manifest,
};
export const nanoBananaDefinition = {
  ...nanoBananaBaseDefinition,
  manifest: nanoBananaManifest,
};
