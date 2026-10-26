import { blobTypes } from "@hypit/hypit/blob";
import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type { ModelFieldValue } from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

export const volcengineMattingModuleRef = { name: "@hypit/volcengine-matting", version: "1" } as const;

export const portraitMattingPorts = defineModelFields({
  model: "matte-portrait-video",
  ports: [
    { name: "source", value: { kind: "media", accepts: ["video"] }, minItems: 1, maxItems: 1 },
    { name: "format", value: { kind: "enum", values: ["WEBM", "MOV"] }, minItems: 1, maxItems: 1,
      defaultItems: ["WEBM"] },
  ],
  requires: [],
});

export function sealPortraitMattingRequest(ports: Readonly<Record<string, readonly ModelFieldValue[]>>) {
  return sealModelFieldRequest(portraitMattingPorts, ports);
}

export const volcengineMattingDefinition = defineFieldModelModule({
  module: volcengineMattingModuleRef,
  endpoints: [{ key: "portrait", requestTypeName: "PortraitMattingRequest",
    producerName: "request-portrait-matting", ports: portraitMattingPorts,
    result: standardGenerationResults.video }],
});
export const portraitMattingEndpoint = volcengineMattingDefinition.endpoints.portrait!;

export const portraitMattingSurface = {
  name: "portrait", tag: "Portrait", mode: "structured" as const,
  outputs: [portraitMattingEndpoint.draftType, portraitMattingEndpoint.mediaBindings.source!.type],
  vocabulary: {
    summary: "Removes a video's background with Volcengine portrait matting and returns transparent video.",
    attributes: [
      { name: "id", kind: "identifier" as const, required: true, summary: "Names the processed video." },
      { name: "source", kind: "reference" as const, required: true, accepts: [blobTypes.blob],
        summary: "The source video Artifact whose people remain visible." },
      { name: "format", kind: "literal" as const, required: false, values: ["WEBM", "MOV"],
        summary: "Transparent output container; defaults to WEBM." },
    ],
    ports: [{ name: "video", type: blobTypes.blob, summary: "The processed video Artifact, before media preparation." }],
    example: '<matte:Portrait id="cutout" source={performance.video}/>',
    notes: ["The source determines duration and dimensions. Prepare the output before using it in a track."],
  },
};
