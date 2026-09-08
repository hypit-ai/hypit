import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type {
  SurfaceAttributeVocabulary,
  SurfacePortVocabulary,
  SurfaceVocabulary,
} from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const minimaxH3ModuleRef = { name: "@hypit/minimax-h3", version: "1" } as const;

/**
 * What MiniMax H3 accepts is a property of the trained model, not of whichever
 * service resells it. A service that splits these ports across several of its
 * own endpoints expresses that in its wire mapping.
 *
 * `768P` and `2K` are the model's own two output tiers — H3-Base renders at
 * 768p and H3-Regenerate-2K re-renders from the original context — so the
 * spelling is MiniMax's, not any gateway's.
 */
export const minimaxH3Ports: GenerationPortTable = sealGenerationPortTable({
  model: "minimax-h3",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 7_000 }, minItems: 1, maxItems: 1 },
    {
      name: "duration",
      value: { kind: "number", integer: true, minimum: 4, maximum: 15 },
      minItems: 1,
      maxItems: 1,
    },
    { name: "resolution", value: { kind: "enum", values: ["768P", "2K"] }, minItems: 0, maxItems: 1 },
    {
      name: "aspectRatio",
      value: { kind: "enum", values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] },
      minItems: 0,
      maxItems: 1,
    },
    { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
    { name: "referenceVideo", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 3 },
    { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0, maxItems: 3 },
    { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
  ],
  requires: [
    { kind: "atMostOneOf", ports: ["referenceImage", "firstFrame"] },
    { kind: "atMostOneOf", ports: ["referenceImage", "lastFrame"] },
    { kind: "atMostOneOf", ports: ["referenceVideo", "firstFrame"] },
    { kind: "atMostOneOf", ports: ["referenceVideo", "lastFrame"] },
    { kind: "atMostOneOf", ports: ["referenceAudio", "firstFrame"] },
    { kind: "atMostOneOf", ports: ["referenceAudio", "lastFrame"] },
    { kind: "requiresAnyOf", port: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
    // A first/last frame run inherits its framing from the uploaded image, so the
    // model takes no aspect ratio in that mode.
    { kind: "atMostOneOf", ports: ["aspectRatio", "firstFrame"] },
    { kind: "atMostOneOf", ports: ["aspectRatio", "lastFrame"] },
    { kind: "weightedTotal", weights: { referenceImage: 1, referenceVideo: 1, referenceAudio: 1 }, maximum: 12 },
  ],
});

export function sealMinimaxH3Request(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(minimaxH3Ports, ports);
}

const minimaxH3BaseDefinition = defineExactModelModule({
  module: minimaxH3ModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "MinimaxH3Request",
    producerName: "request-minimax-h3",
    ports: minimaxH3Ports,
  }],
});

export const minimaxH3Endpoints = minimaxH3BaseDefinition.endpoints;
export const minimaxH3Component = minimaxH3BaseDefinition.component;
const endpoint = minimaxH3Endpoints.video!;
const declaration = (
  name: string, tag: string,
  bindings: readonly (keyof typeof endpoint.mediaBindings)[],
  vocabulary: SurfaceVocabulary,
) => ({
  name, tag, mode: "structured" as const,
  outputs: [endpoint.draftType, ...bindings.map((port) => endpoint.mediaBindings[port]!.type)],
  vocabulary,
});

const minimaxH3Common: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this generation so its video Artifact can be referenced elsewhere in the Source." },
  { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "Selects the Text the model generates from." },
  { name: "duration", kind: "literal", required: true,
    summary: "Sets the length of the generated video in whole seconds." },
  { name: "resolution", kind: "literal", required: false, values: ["768P", "2K"],
    summary: "Chooses which of the model's two output tiers renders the video." },
];

const minimaxH3AspectRatio: SurfaceAttributeVocabulary = {
  name: "aspect-ratio", kind: "literal", required: false,
  values: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
  summary: "Sets the Frame shape of the generated video.",
};

const minimaxH3VideoPorts: readonly SurfacePortVocabulary[] = [
  { name: "video", type: artifactTypes.blob, summary: "The generated video Artifact." },
];

const minimaxH3DurationNote = "`duration` is a whole number of seconds between 4 and 15.";
const minimaxH3ResolutionNote = "`768P` and `2K` are the model's own tiers: H3-Base renders at 768p and H3-Regenerate-2K re-renders from the original context.";

export const minimaxH3MarkupSurfaces = [
    declaration("text-video", "TextVideo", [], {
      summary: "Generates one video Artifact from a Text prompt with the MiniMax H3 model.",
      attributes: [...minimaxH3Common, minimaxH3AspectRatio],
      ports: minimaxH3VideoPorts,
      example: '<h3:TextVideo id="idea" prompt={prompt} duration="6" resolution="768P" aspect-ratio="9:16"/>',
      notes: [
        minimaxH3DurationNote,
        minimaxH3ResolutionNote,
        "The element takes no children and no text content.",
      ],
    }),
    declaration("frame-video", "FrameVideo", ["firstFrame", "lastFrame"], {
      summary: "Generates one video Artifact from a first frame, a last frame, or both with the MiniMax H3 model.",
      attributes: [
        ...minimaxH3Common,
        { name: "first-frame", kind: "reference", required: false, accepts: [artifactTypes.blob],
          summary: "Selects the image Artifact the generated video opens on." },
        { name: "last-frame", kind: "reference", required: false, accepts: [artifactTypes.blob],
          summary: "Selects the image Artifact the generated video closes on." },
      ],
      ports: minimaxH3VideoPorts,
      example: [
        '<h3:FrameVideo id="motion" prompt={motionPrompt} duration="6" resolution="2K"',
        "  first-frame={cover.image} last-frame={ending.image}/>",
      ].join("\n"),
      notes: [
        minimaxH3DurationNote,
        minimaxH3ResolutionNote,
        "A first/last frame run inherits its framing from the given image, so this element takes no `aspect-ratio`.",
        "At least one of `first-frame` or `last-frame` is required; both reference image Blobs.",
        "The element takes no children and no text content.",
      ],
    }),
    declaration("reference-video", "ReferenceVideo", ["referenceImage", "referenceVideo", "referenceAudio"], {
      summary: "Generates one video Artifact from a Text prompt and the image, video and audio subjects it carries with the MiniMax H3 model.",
      attributes: [...minimaxH3Common, minimaxH3AspectRatio],
      children: [
        { tag: "Reference", cardinality: "many",
          summary: "Attaches one subject Artifact the model generates from, chosen by an `image`, `video` or `audio` reference.",
          attributes: [
            { name: "image", kind: "reference", required: false, accepts: [artifactTypes.blob],
              summary: "Selects the image Artifact whose subject the generated video carries." },
            { name: "video", kind: "reference", required: false, accepts: [artifactTypes.blob],
              summary: "Selects the video Artifact whose subject the generated video carries." },
            { name: "audio", kind: "reference", required: false, accepts: [artifactTypes.blob],
              summary: "Selects the audio Artifact the generated video carries." },
          ] },
      ],
      ports: minimaxH3VideoPorts,
      example: [
        '<h3:ReferenceVideo id="montage" prompt={montagePrompt} duration="8" resolution="768P" aspect-ratio="9:16">',
        "  <h3:Reference image={person.image}/>",
        "  <h3:Reference video={gesture.video}/>",
        "</h3:ReferenceVideo>",
      ].join("\n"),
      notes: [
        minimaxH3DurationNote,
        minimaxH3ResolutionNote,
        "`Reference` carries exactly one of `image`, `video` or `audio`, and is empty.",
        "The element requires at least one `Reference`, and accepts at most 9 image, 3 video and 3 audio references and 12 in total.",
        "An audio `Reference` requires an image or video `Reference` beside it.",
        "The element carries no text content.",
      ],
    }),
  ] as const;

export const minimaxH3Manifest = {
  ...minimaxH3BaseDefinition.manifest,
};
export const minimaxH3Definition = {
  ...minimaxH3BaseDefinition, manifest: minimaxH3Manifest,
};
