import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const wanModuleRef = { name: "@hypit/wan", version: "1" } as const;
export const wanModels = ["wan-2.7-image", "wan-2.7-image-pro"] as const;
export type WanModel = typeof wanModels[number];

/**
 * The model renders at one of these bands. It takes no aspect ratio: with input images the output
 * follows the last one, and a prompt-only request renders at the band's own framing.
 */
const WAN_RESOLUTIONS = ["1K", "2K"] as const;
const WAN_PRO_RESOLUTIONS = ["1K", "2K", "4K"] as const;

function wanFieldTable(model: WanModel): ModelFieldTable {
  const pro = model === "wan-2.7-image-pro";
  return defineModelFields({
    model,
    fields: [
      { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
      { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
      {
        name: "resolution",
        value: { kind: "enum", values: pro ? [...WAN_PRO_RESOLUTIONS] : [...WAN_RESOLUTIONS] },
        minItems: 0,
        maxItems: 1,
      },
      // One request renders up to four pictures, or up to twelve as a story-coherent set. The
      // model chooses how many of an image set it returns, so this names a ceiling.
      { name: "count", value: { kind: "number", integer: true, minimum: 1, maximum: 12 }, minItems: 0, maxItems: 1 },
      { name: "imageSet", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      { name: "extendedReasoning", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      { name: "watermark", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      { name: "seed", value: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 }, minItems: 0, maxItems: 1 },
    ],
    // An image set renders one storyline in several pictures, which is what extended reasoning
    // would otherwise shape for a single picture.
    requires: [{ kind: "atMostOneOf", fields: ["imageSet", "extendedReasoning"] }],
  });
}

export const wanFields: Readonly<Record<WanModel, ModelFieldTable>> = {
  "wan-2.7-image": wanFieldTable("wan-2.7-image"),
  "wan-2.7-image-pro": wanFieldTable("wan-2.7-image-pro"),
};

export function sealWanRequest(
  model: WanModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(wanFields[model], fields);
}

const wanBaseDefinition = defineFieldModelModule({
  module: wanModuleRef,
  endpoints: wanModels.map((model) => ({
    key: model === "wan-2.7-image" ? "image" : "pro",
    requestTypeName: model === "wan-2.7-image" ? "WanImageRequest" : "WanProImageRequest",
    producerName: `request-${model}`,
    fields: wanFields[model],
    result: standardGenerationResults.image,
  })),
});

export const wanEndpoints = wanBaseDefinition.endpoints;
export const wanComponent = wanBaseDefinition.component;

export const wanManifest = {
  ...wanBaseDefinition.manifest,
};
export const wanDefinition = {
  ...wanBaseDefinition,
  manifest: wanManifest,
};
