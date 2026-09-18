import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type { GenerationPortTable, GenerationPortValue, GenerationRequest } from "@hypit/generation";
import type { SurfaceAttributeVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

export const pixverseModuleRef = { name: "@hypit/pixverse", version: "1" } as const;
export const pixverseModels = ["pixverse-v6"] as const;
export type PixverseModel = typeof pixverseModels[number];

const PIXVERSE_QUALITIES = ["360p", "540p", "720p", "1080p"] as const;
const PIXVERSE_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"] as const;

export const pixverseV6Ports: GenerationPortTable = sealGenerationPortTable({
  model: "pixverse-v6",
  result: "video",
  ports: [
    { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
    { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
    { name: "duration", value: { kind: "number", integer: true, minimum: 1, maximum: 15 }, minItems: 1, maxItems: 1 },
    { name: "quality", value: { kind: "enum", values: [...PIXVERSE_QUALITIES] }, minItems: 1, maxItems: 1 },
    { name: "aspectRatio", value: { kind: "enum", values: [...PIXVERSE_ASPECT_RATIOS] }, minItems: 0, maxItems: 1 },
    { name: "generateAudio", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
    { name: "multiClip", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
    { name: "seed", value: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 }, minItems: 0, maxItems: 1 },
  ],
  requires: [
    // A last frame states where a run that already has a first frame ends.
    { kind: "requiresPresent", port: "lastFrame", needs: ["firstFrame"] },
    // A run that starts from a frame inherits that frame's shape, and one that
    // bridges two frames renders a single continuous shot.
    { kind: "atMostOneOf", ports: ["aspectRatio", "firstFrame"] },
    { kind: "atMostOneOf", ports: ["multiClip", "lastFrame"] },
  ],
});

export const pixversePorts: Readonly<Record<PixverseModel, GenerationPortTable>> = {
  "pixverse-v6": pixverseV6Ports,
};

export function sealPixverseRequest(
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(pixverseV6Ports, ports);
}

const pixverseBaseDefinition = defineExactModelModule({
  module: pixverseModuleRef,
  endpoints: [{
    key: "video",
    requestTypeName: "PixverseV6Request",
    producerName: "request-pixverse-v6",
    ports: pixverseV6Ports,
  }],
});

export const pixverseEndpoints = pixverseBaseDefinition.endpoints;
export const pixverseComponent = pixverseBaseDefinition.component;
const endpoint = pixverseEndpoints.video!;

const pixverseAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this generation so its video Artifact can be referenced elsewhere in the Source." },
  { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "The Text edge describing the shot, including any spoken line the model should voice." },
  { name: "first-frame", kind: "reference", required: false, accepts: [artifactTypes.blob],
    summary: "Starts the video from one image Artifact." },
  { name: "last-frame", kind: "reference", required: false, accepts: [artifactTypes.blob],
    summary: "Ends the video on one image Artifact, bridging from the first frame." },
  { name: "duration", kind: "literal", required: true,
    summary: "How many seconds of video to render, from 1 to 15." },
  { name: "quality", kind: "literal", required: true, values: [...PIXVERSE_QUALITIES],
    summary: "The size band the model renders at." },
  { name: "aspect-ratio", kind: "literal", required: false, values: [...PIXVERSE_ASPECT_RATIOS],
    summary: "The Frame shape of the generated video." },
  { name: "generate-audio", kind: "literal", required: false, values: ["true", "false"],
    summary: "Renders an audio track alongside the picture." },
  { name: "multi-clip", kind: "literal", required: false, values: ["true", "false"],
    summary: "Renders the prompt as several cuts instead of one continuous shot." },
  { name: "seed", kind: "literal", required: false,
    summary: "Seeds the model's sampling so a rerun stays close to this one." },
];

export const pixverseMarkupSurfaces = [{
  name: "video",
  tag: "Video",
  mode: "structured" as const,
  outputs: [endpoint.draftType, endpoint.mediaBindings.firstFrame!.type, endpoint.mediaBindings.lastFrame!.type],
  vocabulary: {
      summary: "Generates one video with the exact PixVerse V6 model from a Text prompt, optionally starting from a frame or bridging two.",
    attributes: pixverseAttributes,
    ports: [{
      name: "video",
      type: artifactTypes.blob,
      summary: "The generated video, addressed as `<id>.video`.",
    }],
    example: `<pix:Video
  id="opening"
  prompt={line}
  duration="5"
  quality="720p"
  aspect-ratio="9:16"
  generate-audio="true"
/>`,
    notes: [
      "A run that starts from a frame takes its shape from that frame, so `aspect-ratio` states the shape only for a prompt-only run.",
      "A `last-frame` bridges from the `first-frame` into one continuous shot, so it is not combined with `multi-clip`.",
      "A spoken line belongs in the prompt; the model exposes no separate voice, language or dialogue field.",
      "The Surface lowers the element into the package's exact model request and selects no Provider.",
    ],
  },
}] as const;

export const pixverseManifest = {
  ...pixverseBaseDefinition.manifest,
};
export const pixverseDefinition = {
  ...pixverseBaseDefinition,
  manifest: pixverseManifest,
};
