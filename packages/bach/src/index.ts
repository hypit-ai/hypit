import { blobTypes } from "@hypit/hypit/blob";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary, SurfaceVocabulary } from "@hypit/hypit/markup";
import { textTypes } from "@hypit/hypit/text";
import { sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import { defineExactModelModule } from "@hypit/generation/model";
import { validateBachInputs } from "./validation.js";

export const bachModuleRef = { name: "@hypit/bach", version: "1" } as const;

const ASPECT_RATIOS = ["4:3", "3:4", "16:9", "9:16", "21:9", "1:1", "auto"] as const;
const REFERENCE_FIELDS = [
  { name: "startTime", value: { kind: "number", minimum: 0 }, optional: true },
] as const;

export const bachPorts: GenerationPortTable = sealGenerationPortTable({
  model: "bach-1.0-pro",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 6_500 }, minItems: 1, maxItems: 1 },
    { name: "duration", value: { kind: "number", minimum: 5, maximum: 16 }, minItems: 0, maxItems: 1 },
    { name: "resolution", value: { kind: "enum", values: ["1080p", "4k"] }, minItems: 0, maxItems: 1 },
    { name: "aspectRatio", value: { kind: "enum", values: ASPECT_RATIOS }, minItems: 0, maxItems: 1 },
    { name: "generateAudio", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
    { name: "seed", value: { kind: "number", integer: true, minimum: 1, maximum: 100_000 }, minItems: 0, maxItems: 1 },
    { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "referenceImage", value: { kind: "media", accepts: ["image"], itemFields: REFERENCE_FIELDS }, minItems: 0, maxItems: 9 },
    { name: "referenceVideo", value: { kind: "media", accepts: ["video"], itemFields: REFERENCE_FIELDS }, minItems: 0, maxItems: 3 },
    { name: "referenceAudio", value: { kind: "media", accepts: ["audio"], itemFields: REFERENCE_FIELDS }, minItems: 0, maxItems: 3 },
  ],
  requires: [
    { kind: "atMostOneOf", ports: ["firstFrame", "referenceImage"] },
    { kind: "atMostOneOf", ports: ["firstFrame", "referenceVideo"] },
    { kind: "atMostOneOf", ports: ["firstFrame", "referenceAudio"] },
    { kind: "atMostOneOf", ports: ["lastFrame", "referenceImage"] },
    { kind: "atMostOneOf", ports: ["lastFrame", "referenceVideo"] },
    { kind: "atMostOneOf", ports: ["lastFrame", "referenceAudio"] },
    { kind: "requiresAnyOf", port: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
    { kind: "weightedTotal", weights: { referenceImage: 1, referenceVideo: 1, referenceAudio: 1 }, maximum: 12 },
  ],
});

export const bachDefinition = defineExactModelModule({
  module: bachModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "BachProRequest",
    producerName: "request-bach-1.0-pro",
    ports: bachPorts,
    validateInputs: validateBachInputs,
  }],
});

export const bachEndpoints = bachDefinition.endpoints;
export const bachComponent = bachDefinition.component;
export const bachManifest = bachDefinition.manifest;

export function sealBachRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return bachEndpoints.video.sealRequest(ports);
}

const endpoint = bachEndpoints.video;
function declaration(
  name: string,
  tag: string,
  bindings: readonly string[],
  vocabulary: SurfaceVocabulary,
) {
  return {
    name, tag, mode: "structured" as const,
    outputs: [endpoint.draftType, ...bindings.map((port) => endpoint.mediaBindings[port]!.type)],
    vocabulary,
  };
}

const commonAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true, summary: "Names the generated video Artifact." },
  { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text], summary: "Selects the Text describing the video." },
  { name: "duration", kind: "literal", required: false, summary: "Sets the output duration from 5 to 16 seconds, including decimals; defaults to 5." },
  { name: "resolution", kind: "literal", required: false, values: ["1080p", "4k"], summary: "Sets the output resolution; defaults to 1080p." },
  { name: "generate-audio", kind: "literal", required: false, values: ["true", "false"], summary: "Includes an audio track; defaults to true." },
  { name: "seed", kind: "literal", required: false, summary: "Sets an integer sampling seed from 1 to 100000." },
];
const aspectRatio: SurfaceAttributeVocabulary = {
  name: "aspect-ratio", kind: "literal", required: false, values: ASPECT_RATIOS,
  summary: "Sets the output aspect ratio; defaults to 16:9.",
};
const videoPorts: readonly SurfacePortVocabulary[] = [
  { name: "video", type: blobTypes.blob, summary: "The generated video Artifact, addressed as <id>.video." },
];
const promptNote = "The prompt must contain 1 to 6500 characters, including non-whitespace text.";
const durationNote = "`duration` accepts decimals from 5 to 16 seconds. Billing and reported usage round up to the next whole second.";

export const bachMarkupSurfaces = [
  declaration("text-video", "TextVideo", [], {
    summary: "Generates a video from a Text prompt with Bach 1.0 Pro.",
    attributes: [...commonAttributes, aspectRatio],
    ports: videoPorts,
    example: '<bach:TextVideo id="opening" prompt={prompt} duration="5.5" resolution="1080p" aspect-ratio="16:9"/>',
    notes: [promptNote, durationNote, "The element is empty."],
  }),
  declaration("frame-video", "FrameVideo", ["firstFrame", "lastFrame"], {
    summary: "Generates a video from a first frame, a last frame, or both with Bach 1.0 Pro.",
    attributes: [
      ...commonAttributes,
      { name: "aspect-ratio", kind: "literal", required: false, summary: "Uses auto for frame-guided generation, regardless of the supplied value." },
      { name: "first-frame", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects the opening image Artifact." },
      { name: "last-frame", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects the closing image Artifact." },
    ],
    ports: videoPorts,
    example: '<bach:FrameVideo id="transition" prompt={prompt} first-frame={opening.image} last-frame={ending.image}/>',
    notes: [promptNote, durationNote, "At least one frame is required. The output aspect ratio is always `auto`; any supplied `aspect-ratio` is treated as `auto`.", "Each frame must be 10 MB or smaller.", "The element is empty."],
  }),
  declaration("reference-video", "ReferenceVideo", ["referenceImage", "referenceVideo", "referenceAudio"], {
    summary: "Generates a video from a Text prompt and image, video or audio references with Bach 1.0 Pro.",
    attributes: [...commonAttributes, aspectRatio],
    children: [{
      tag: "Reference", cardinality: "many",
      summary: "Attaches one reference Artifact.",
      attributes: [
        { name: "image", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects an image Artifact." },
        { name: "video", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects a video Artifact." },
        { name: "audio", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects an audio Artifact." },
        { name: "start-time", kind: "literal", required: false, summary: "Sets a nonnegative start offset within this asset, in seconds." },
      ],
    }],
    ports: videoPorts,
    example: [
      '<bach:ReferenceVideo id="scene" prompt={prompt} duration="8" resolution="4k">',
      '  <bach:Reference image={subject.image}/>',
      '  <bach:Reference video={motion.video} start-time="1.5"/>',
      '  <bach:Reference audio={sound.audio}/>',
      '</bach:ReferenceVideo>',
    ].join("\n"),
    notes: [
      promptNote, durationNote,
      "Each empty `Reference` selects exactly one of `image`, `video` or `audio`.",
      "At least one image or video is required. Limits are 9 images, 3 videos, 3 audio files and 12 references in total.",
      "The prompt refers to assets as `@Image1`, `@Video1` and `@Audio1`, numbered from 1 separately for each media type.",
      "Images: JPG/JPEG, PNG or WEBP, 480 to 2048 pixels per dimension, at most 10 MB each.",
      "Videos: MP4 or MOV, H.264/AVC or H.265/HEVC with AAC or MP3 audio, 480 to 2048 pixels per dimension, at most 30 MB each.",
      "Audio: WAV or MP3, at most 15 MB each. Each video or audio clip must last 2 to 15 seconds; each media type totals at most 15 seconds.",
      "The element accepts Reference children and whitespace.",
    ],
  }),
] as const;
