import {
  sealModelFieldRequest,
  sealModelFieldBuilder,
  defineModelFields,
} from "@hypit/generation/model-fields";
import type { ModelFieldTable, ModelFieldValue, ModelFieldRequest } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";
import { imageOperationsModuleRef } from "@hypit/image-operations";

export const gptImageModuleRef = { name: "@hypit/gpt-image", version: "1" } as const;

export const gptImage2Fields: ModelFieldTable = defineModelFields({
  model: "gpt-image-2",
  fields: [
    { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: {
        kind: "enum",
        values: [
          "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16",
          "2:1", "1:2", "3:1", "1:3", "21:9", "9:21", "5:4", "4:5",
        ],
      },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["1K", "2K", "4K"] }, minItems: 1, maxItems: 1 },
    {
      name: "background",
      value: { kind: "enum", values: ["transparent", "opaque", "auto"] },
      minItems: 0,
      maxItems: 1,
    },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 16 },
  ],
  requires: [],
});

export function sealGptImage2Request(
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(gptImage2Fields, fields);
}

/** Initial request draft; graph edges attach Text and reference images later. */
export function sealGptImage2Draft(
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
) {
  return sealModelFieldBuilder(gptImage2Fields, fields);
}

const gptImageBaseDefinition = defineFieldModelModule({
  module: gptImageModuleRef,
  endpoints: [{
    key: "image",
    requestTypeName: "GptImage2Request",
    producerName: "request-gpt-image-2",
    fields: gptImage2Fields,
    result: standardGenerationResults.image,
  }],
});

export const gptImageEndpoints = gptImageBaseDefinition.endpoints;
export const gptImageComponent = gptImageBaseDefinition.component;

export const gptImageManifest = {
  ...gptImageBaseDefinition.manifest,
};
export const gptImageDefinition = {
  ...gptImageBaseDefinition,
  manifest: gptImageManifest,
};

/** Optional authoring submodule; the exact GPT model remains independent of post-processing. */
export const gptImageCleanModuleRef = { name: "@hypit/gpt-image/clean", version: "1" } as const;

export const gptImageCleanManifest = {
  format: "hypit.module@1" as const,
  name: gptImageCleanModuleRef.name,
  version: gptImageCleanModuleRef.version,
  dependencies: [
    gptImageModuleRef,
    imageOperationsModuleRef,
  ],
  types: [],
  capabilities: [],
  producers: [],
};
export { gptImageCleanupProgram } from "./cleanup-program.js";
export { createGptImageCleanFragment } from "./fragment.js";
