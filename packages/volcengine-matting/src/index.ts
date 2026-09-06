import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortValue } from "@hypit/generation";
import { defineExactModelModule } from "@hypit/model-kit";

export const volcengineMattingModuleRef = { name: "@hypit/volcengine-matting", version: "1" } as const;

export const portraitMattingPorts = sealGenerationPortTable({
  model: "matte-portrait-video",
  result: "video",
  ports: [
    { name: "source", value: { kind: "media", accepts: ["video"] }, minItems: 1, maxItems: 1 },
    { name: "format", value: { kind: "enum", values: ["WEBM", "MOV"] }, minItems: 0, maxItems: 1 },
  ],
  requires: [],
});

export function sealPortraitMattingRequest(ports: Readonly<Record<string, readonly GenerationPortValue[]>>) {
  return sealGenerationPortRequest(portraitMattingPorts, ports);
}

export const volcengineMattingDefinition = defineExactModelModule({
  module: volcengineMattingModuleRef,
  endpoints: [{ key: "portrait", requestTypeName: "PortraitMattingRequest",
    producerName: "request-portrait-matting", ports: portraitMattingPorts }],
});
export const portraitMattingEndpoint = volcengineMattingDefinition.endpoints.portrait!;

export const portraitMattingSurface = {
  name: "portrait", tag: "Portrait", mode: "structured" as const,
  outputs: [portraitMattingEndpoint.draftType, portraitMattingEndpoint.mediaBindings.source!.type],
  vocabulary: {
    summary: "Removes a video's background with Volcengine portrait matting and returns transparent video.",
    attributes: [
      { name: "id", kind: "identifier" as const, required: true, summary: "Names the processed video." },
      { name: "source", kind: "reference" as const, required: true, accepts: [artifactTypes.blob],
        summary: "The source video Artifact whose people remain visible." },
      { name: "format", kind: "literal" as const, required: false, values: ["WEBM", "MOV"],
        summary: "Transparent output container; defaults to WEBM." },
    ],
    ports: [{ name: "video", type: artifactTypes.blob, summary: "The processed video Artifact, before normalization." }],
    example: '<matte:Portrait id="cutout" source={performance.video}/>',
    notes: ["The source determines duration and dimensions. Normalize the output before using it in a track."],
  },
};
