import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const minimaxH3ModuleRef = { name: "@hypit/minimax-h3", version: "1" } as const;

/**
 * What MiniMax H3 accepts is a property of the trained model, not of whichever
 * service resells it. A service that splits these fields across several of its
 * own endpoints expresses that in its wire mapping.
 *
 * `768P` and `2K` are the model's own two output tiers — H3-Base renders at
 * 768p and H3-Regenerate-2K re-renders from the original context — so the
 * spelling is MiniMax's, not any gateway's.
 */
export const minimaxH3Fields: ModelFieldTable = defineModelFields({
  model: "minimax-h3",
  fields: [
    { name: "prompt", value: { kind: "text", maxChars: 7_000 }, minItems: 1, maxItems: 1 },
    {
      name: "duration",
      value: { kind: "number", integer: true, minimum: 4, maximum: 15 },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["768P", "2K"] }, minItems: 1, maxItems: 1,
      defaultItems: ["2K"] },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] },
      minItems: 0,
      maxItems: 1,
    },
    { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0 },
    { name: "referenceVideo", value: { kind: "media", accepts: ["video"] }, minItems: 0 },
    { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0 },
    { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
  ],
  requires: [
    { kind: "atMostOneOf", fields: ["referenceImage", "firstFrame"] },
    { kind: "atMostOneOf", fields: ["referenceImage", "lastFrame"] },
    { kind: "atMostOneOf", fields: ["referenceVideo", "firstFrame"] },
    { kind: "atMostOneOf", fields: ["referenceVideo", "lastFrame"] },
    { kind: "atMostOneOf", fields: ["referenceAudio", "firstFrame"] },
    { kind: "atMostOneOf", fields: ["referenceAudio", "lastFrame"] },
    { kind: "requiresAnyOf", field: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
    // A first/last frame run inherits its framing from the uploaded image, so the
    // model takes no aspect ratio in that mode.
    { kind: "atMostOneOf", fields: ["aspectRatio", "firstFrame"] },
    { kind: "atMostOneOf", fields: ["aspectRatio", "lastFrame"] },
  ],
});

export function sealMinimaxH3Request(
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(minimaxH3Fields, fields);
}

const minimaxH3BaseDefinition = defineFieldModelModule({
  module: minimaxH3ModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "MinimaxH3Request",
    producerName: "request-minimax-h3",
    fields: minimaxH3Fields,
    result: standardGenerationResults.video,
  }],
});

export const minimaxH3Endpoints = minimaxH3BaseDefinition.endpoints;
export const minimaxH3Component = minimaxH3BaseDefinition.component;

export const minimaxH3Manifest = {
  ...minimaxH3BaseDefinition.manifest,
};
export const minimaxH3Definition = {
  ...minimaxH3BaseDefinition, manifest: minimaxH3Manifest,
};
