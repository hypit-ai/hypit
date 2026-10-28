import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldValue } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const volcengineMattingModuleRef = { name: "@hypit/volcengine-matting", version: "1" } as const;

export const portraitMattingFields = defineModelFields({
  model: "matte-portrait-video",
  fields: [
    { name: "source", value: { kind: "media", accepts: ["video"] }, minItems: 1, maxItems: 1 },
    { name: "format", value: { kind: "enum", values: ["WEBM", "MOV"] }, minItems: 1, maxItems: 1,
      defaultItems: ["WEBM"] },
  ],
  requires: [],
});

export function sealPortraitMattingRequest(fields: Readonly<Record<string, readonly ModelFieldValue[]>>) {
  return sealModelFieldRequest(portraitMattingFields, fields);
}

export const volcengineMattingDefinition = defineFieldModelModule({
  module: volcengineMattingModuleRef,
  endpoints: [{ key: "portrait", requestTypeName: "PortraitMattingRequest",
    producerName: "request-portrait-matting", fields: portraitMattingFields,
    result: standardGenerationResults.video }],
});
export const portraitMattingEndpoint = volcengineMattingDefinition.endpoints.portrait!;
