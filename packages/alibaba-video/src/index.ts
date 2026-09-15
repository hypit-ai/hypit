import { artifactTypes } from "@hypit/artifact";
import {
  sealGenerationPortRequest,
  sealGenerationPortTable,
} from "@hypit/generation";
import type {
  GenerationPortTable,
  GenerationPortValue,
  GenerationRequest,
} from "@hypit/generation";
import type {
  SurfaceAttributeVocabulary,
  SurfacePortVocabulary,
  SurfaceVocabulary,
} from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

/**
 * Alibaba Video Generation Models
 * Supports:
 * - alibaba-qwen-vvg: Qwen Video Generation model
 */
export const alibabaVideoModuleRef = {
  name: "@hypit/alibaba-video",
  version: "1",
} as const;

export const alibabaVideoModels = [
  "alibaba-qwen-vvg",
] as const;
export type AlibabaVideoModel = typeof alibabaVideoModels[number];

const ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
] as const;

const RESOLUTIONS = [
  "480p",
  "720p",
  "1080p",
] as const;

/**
 * Alibaba Video Generation model ports configuration.
 * Defines the input/output structure for video generation requests.
 */
function alibabaVideoPortTable(
  model: AlibabaVideoModel
): GenerationPortTable {
  return sealGenerationPortTable({
    model,
    result: "video",
    ports: [
      {
        name: "prompt",
        value: { kind: "text", maxChars: 200 },
        minItems: 1,
        maxItems: 1,
      },
      {
        name: "duration",
        value: { kind: "number", integer: true, minimum: 5, maximum: 10 },
        minItems: 1,
        maxItems: 1,
      },
      {
        name: "resolution",
        value: {
          kind: "enum",
          values: [...RESOLUTIONS],
        },
        minItems: 0,
        maxItems: 1,
      },
      {
        name: "aspectRatio",
        value: { kind: "enum", values: [...ASPECT_RATIOS] },
        minItems: 0,
        maxItems: 1,
      },
      {
        name: "referenceImage",
        value: { kind: "media", accepts: ["image"] },
        minItems: 0,
        maxItems: 1,
      },
    ],
    requires: [],
  });
}

export const alibabaVideoPorts: Readonly<
  Record<AlibabaVideoModel, GenerationPortTable>
> = {
  "alibaba-qwen-vvg": alibabaVideoPortTable("alibaba-qwen-vvg"),
};

export type AlibabaVideoPortMap = Readonly<
  Record<string, readonly GenerationPortValue[]>
>;

export function sealAlibabaVideoRequest(
  model: AlibabaVideoModel,
  ports: AlibabaVideoPortMap
): GenerationRequest {
  return sealGenerationPortRequest(alibabaVideoPorts[model], ports);
}

const alibabaVideoBaseDefinition = defineExactModelModule({
  module: alibabaVideoModuleRef,
  endpoints: [
    {
      key: "qwen-vvg",
      requestTypeName: "AlibabaQwenVVGRequest",
      producerName: "request-alibaba-qwen-vvg",
      ports: alibabaVideoPorts["alibaba-qwen-vvg"],
    },
  ],
});

export const alibabaVideoEndpoints = alibabaVideoBaseDefinition.endpoints;
export const alibabaVideoComponent = alibabaVideoBaseDefinition.component;

const alibabaVideoCommonAttributes: readonly SurfaceAttributeVocabulary[] = [
  {
    name: "id",
    kind: "identifier",
    required: true,
    summary: "Names this generation and prefixes the binding it publishes.",
  },
  {
    name: "model",
    kind: "literal",
    required: true,
    summary: "Chooses the exact Alibaba video model that renders the video.",
    values: ["qwen-vvg", "alibaba-qwen-vvg"],
  },
  {
    name: "prompt",
    kind: "reference",
    required: true,
    summary: "The Text description for the video generation (max 200 characters).",
    accepts: [textTypes.text],
  },
  {
    name: "duration",
    kind: "literal",
    required: true,
    summary: "Sets the length of the video in seconds (5-10 seconds).",
  },
  {
    name: "resolution",
    kind: "literal",
    required: false,
    summary: "Chooses the output resolution of the video.",
    values: [...RESOLUTIONS],
  },
  {
    name: "aspect-ratio",
    kind: "literal",
    required: false,
    summary: "Chooses the aspect ratio of the generated video.",
    values: [...ASPECT_RATIOS],
  },
];

const alibabaVideoPort: readonly SurfacePortVocabulary[] = [
  {
    name: "video",
    type: artifactTypes.blob,
    summary: "The generated video Artifact.",
  },
];

const alibabaVideoSettingNotes: readonly string[] = [
  "`duration` must be between 5 and 10 seconds.",
  "`resolution` defaults to `720p`.",
  "`aspect-ratio` defaults to `16:9`.",
  "Prompt text is limited to 200 characters maximum.",
];

export const alibabaVideoMarkupSurfaces = [
  {
    name: "text-video",
    tag: "TextVideo",
    mode: "structured",
    outputs: Object.values(alibabaVideoEndpoints).flatMap((endpoint) => [
      endpoint.draftType,
      ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
    ]),
    vocabulary: {
      summary:
        "Generates one video with Alibaba Qwen video model from a Text prompt alone.",
      attributes: alibabaVideoCommonAttributes,
      ports: alibabaVideoPort,
      example:
        '<alibaba:TextVideo id="scene" model="qwen-vvg" prompt={description} duration="5" resolution="720p" aspect-ratio="16:9"/>',
      notes: [
        ...alibabaVideoSettingNotes,
        "The element accepts no children and no text content.",
      ],
    } as SurfaceVocabulary,
  },
  {
    name: "reference-video",
    tag: "ReferenceVideo",
    mode: "structured",
    outputs: Object.values(alibabaVideoEndpoints).flatMap((endpoint) => [
      endpoint.draftType,
      ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
    ]),
    vocabulary: {
      summary:
        "Generates one video with Alibaba Qwen model from a Text prompt and an optional reference image.",
      attributes: [
        ...alibabaVideoCommonAttributes,
        {
          name: "reference-image",
          kind: "reference",
          required: false,
          summary:
            "The image Artifact to use as a style or content reference for video generation.",
          accepts: [artifactTypes.blob],
        },
      ],
      ports: alibabaVideoPort,
      example:
        '<alibaba:ReferenceVideo id="styled-scene" model="qwen-vvg" prompt={description} duration="6" resolution="1080p" aspect-ratio="9:16" reference-image={style.image}/>',
      notes: [
        ...alibabaVideoSettingNotes,
        "Reference image is optional and provides style guidance.",
        "The element accepts no children and no text content.",
      ],
    } as SurfaceVocabulary,
  },
] as const;

export const alibabaVideoManifest = alibabaVideoBaseDefinition.manifest;
export const alibabaVideoDefinition = alibabaVideoBaseDefinition;

export { createAlibabaVideoAssembledGenerationFragment } from "./fragment.js";
export {
  decodeAlibabaVideoTextVideoSurface,
  decodeAlibabaVideoReferenceVideoSurface,
} from "./surface.js";
