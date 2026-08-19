import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type {
  SurfaceAttributeVocabulary,
  SurfaceChildVocabulary,
  SurfacePortVocabulary,
  SurfaceVocabulary,
} from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const grokImagineModuleRef = { name: "@hypit/grok-imagine", version: "1" } as const;
export const grokImagineModels = ["grok-imagine-video", "grok-imagine-video-1.5-preview"] as const;
export type GrokImagineModel = typeof grokImagineModels[number];

export const grokImagineVideoPorts: GenerationPortTable = sealGenerationPortTable({
  model: "grok-imagine-video",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 6, maximum: 30 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 4 },
    /** Continues an earlier generation; only meaningful beside its source images. */
    { name: "sourceTaskId", value: { kind: "token", minLength: 1, maxLength: 255 }, minItems: 0, maxItems: 1 },
  ],
  requires: [{ kind: "requiresPresent", port: "sourceTaskId", needs: ["images"] }],
});

export const grokImagine15PreviewPorts: GenerationPortTable = sealGenerationPortTable({
  model: "grok-imagine-video-1.5-preview",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["2:3", "3:2", "1:1", "16:9", "9:16"] },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["480p", "720p", "1080p"] }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 6, maximum: 30 }, minItems: 1, maxItems: 1 },
    { name: "images", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 4 },
  ],
  requires: [],
});

export const grokImaginePorts: Readonly<Record<GrokImagineModel, GenerationPortTable>> = {
  "grok-imagine-video": grokImagineVideoPorts,
  "grok-imagine-video-1.5-preview": grokImagine15PreviewPorts,
};

export function sealGrokImagineRequest(
  model: GrokImagineModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(grokImaginePorts[model], ports);
}

const grokImagineBaseDefinition = defineExactModelModule({
  module: grokImagineModuleRef,
  endpoints: [
    {
      key: "video",
      requestTypeName: "GrokImagineVideoRequest",
      producerName: "request-grok-imagine-video",
      ports: grokImagineVideoPorts,
    },
    {
      key: "preview-1.5",
      requestTypeName: "GrokImagine15PreviewRequest",
      producerName: "request-grok-imagine-preview-1-5",
      ports: grokImagine15PreviewPorts,
    },
  ],
});

export const grokImagineEndpoints = grokImagineBaseDefinition.endpoints;
export const grokImagineComponent = grokImagineBaseDefinition.component;
const surface = (
  name: "video" | "preview-video",
  tag: "Video" | "PreviewVideo",
  endpoint: NonNullable<(typeof grokImagineEndpoints)["video" | "preview-1.5"]>,
  vocabulary: SurfaceVocabulary,
) => ({
  name,
  tag,
  mode: "structured" as const,
  outputs: [endpoint.draftType, endpoint.mediaBindings.images!.type],
  vocabulary,
});

const grokImagineVideoAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this generation so its video Artifact can be referenced elsewhere in the Source." },
  { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "Selects the Text the model generates from." },
  { name: "duration", kind: "literal", required: true,
    summary: "Sets the length of the generated video in whole seconds." },
  { name: "aspect-ratio", kind: "literal", required: true,
    values: ["2:3", "3:2", "1:1", "16:9", "9:16"],
    summary: "Sets the width-to-height ratio of the generated video." },
  { name: "resolution", kind: "literal", required: true,
    values: ["480p", "720p", "1080p"],
    summary: "Sets the picture height of the generated video." },
];

const grokImagineVideoChildren: readonly SurfaceChildVocabulary[] = [
  { tag: "Reference", cardinality: "many",
    summary: "Attaches one image Artifact the model generates from.",
    attributes: [
      { name: "image", kind: "reference", required: true, accepts: [artifactTypes.blob],
        summary: "Selects the image Artifact this reference contributes." },
    ] },
];

const grokImagineVideoPortVocabulary: readonly SurfacePortVocabulary[] = [
  { name: "video", type: artifactTypes.blob,
    summary: "The generated video Artifact." },
];

const grokImagineVideoNotes: readonly string[] = [
  "`Reference` accepts only an `image` reference to an image Blob, is empty, and repeats at most four times.",
  "`duration` is a whole number of seconds between 6 and 30.",
];

export const grokImagineMarkupSurfaces = [
    surface("video", "Video", grokImagineEndpoints.video!, {
      summary: "Generates one video Artifact from a Text prompt and up to four reference images with the Grok Imagine video model.",
      attributes: [
        ...grokImagineVideoAttributes,
        { name: "source-task-id", kind: "literal", required: false,
          summary: "Continues an earlier Grok Imagine generation named by its task identifier." },
      ],
      children: grokImagineVideoChildren,
      ports: grokImagineVideoPortVocabulary,
      example: [
        '<grok:Video id="clip" prompt={prompt} duration="6" aspect-ratio="9:16" resolution="720p">',
        "  <grok:Reference image={person.image}/>",
        "</grok:Video>",
      ].join("\n"),
      notes: [
        ...grokImagineVideoNotes,
        "`source-task-id` requires at least one `Reference`; the continuation resumes from the images it names.",
        "The element carries no text content.",
      ],
    }),
    surface("preview-video", "PreviewVideo", grokImagineEndpoints["preview-1.5"]!, {
      summary: "Generates one video Artifact from a Text prompt and up to four reference images with the Grok Imagine 1.5 preview video model.",
      attributes: grokImagineVideoAttributes,
      children: grokImagineVideoChildren,
      ports: grokImagineVideoPortVocabulary,
      example: '<grok:PreviewVideo id="preview" prompt={previewPrompt} duration="6" aspect-ratio="9:16" resolution="720p"/>',
      notes: [
        ...grokImagineVideoNotes,
        "The preview model has no continuation port, so `source-task-id` belongs to `Video` alone.",
        "The element carries no text content.",
      ],
    }),
  ] as const;

export const grokImagineManifest = {
  ...grokImagineBaseDefinition.manifest,
};
export const grokImagineDefinition = {
  ...grokImagineBaseDefinition,
  manifest: grokImagineManifest,
};
