import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const seedreamModuleRef = { name: "@hypit/seedream", version: "1" } as const;

export const seedream5LiteFields: ModelFieldTable = defineModelFields({
  model: "seedream-5-lite",
  fields: [
    { name: "prompt", value: { kind: "text", maxChars: 3_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"] },
      minItems: 1,
      maxItems: 1,
    },
    /** Basic renders 2K, high 3K and ultra 4K. */
    { name: "quality", value: { kind: "enum", values: ["basic", "high", "ultra"] }, minItems: 1, maxItems: 1 },
    { name: "outputFormat", value: { kind: "enum", values: ["png", "jpeg"] }, minItems: 1, maxItems: 1 },
    /** Explicit author choice; the Provider never silently changes this policy. */
    { name: "nsfwCheck", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 14 },
  ],
  requires: [],
});

export function sealSeedreamRequest(
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(seedream5LiteFields, fields);
}

const seedreamBaseDefinition = defineFieldModelModule({
  module: seedreamModuleRef,
  endpoints: [{
    key: "image",
    requestTypeName: "Seedream5LiteRequest",
    producerName: "request-seedream-5-lite",
    fields: seedream5LiteFields,
    result: standardGenerationResults.image,
  }],
});

export const seedreamEndpoints = seedreamBaseDefinition.endpoints;
export const seedreamComponent = seedreamBaseDefinition.component;

export const seedreamManifest = {
  ...seedreamBaseDefinition.manifest,
};
export const seedreamDefinition = {
  ...seedreamBaseDefinition, manifest: seedreamManifest,
};
