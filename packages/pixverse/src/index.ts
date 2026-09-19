import { artifactTypes } from "@hypit/artifact";
import { sealGenerationPortRequest, sealGenerationPortTable } from "@hypit/generation";
import type {
  GenerationPort,
  GenerationPortRequirement,
  GenerationPortTable,
  GenerationPortValue,
  GenerationRequest,
} from "@hypit/generation";
import type { SurfaceAttributeVocabulary, SurfacePortVocabulary } from "@hypit/markup";
import { defineExactModelModule } from "@hypit/model-kit";
import { textTypes } from "@hypit/text";

import { pixverseRequestValidator } from "./validation.js";

export const pixverseModuleRef = { name: "@hypit/pixverse", version: "1" } as const;
export const pixverseModels = ["pixverse-v6", "pixverse-c1"] as const;
export type PixverseModel = typeof pixverseModels[number];

const PIXVERSE_QUALITIES = ["360p", "540p", "720p", "1080p"] as const;
const PIXVERSE_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"] as const;
/** V6 reads `auto` as the shape of the reference videos it generates from. */
const PIXVERSE_V6_ASPECT_RATIOS = [...PIXVERSE_ASPECT_RATIOS, "auto"] as const;

/**
 * Exact PixVerse model inputs. V6 takes up to ten reference images and up to two reference videos,
 * and carries the sampling seed and multi-clip switch its endpoints declare. C1 takes up to seven
 * reference images and generates from a prompt, a frame or a pair of frames.
 */
function pixversePortTable(model: PixverseModel): GenerationPortTable {
  const v6 = model === "pixverse-v6";
  const referenceVideo: readonly GenerationPort[] = v6
    ? [{ name: "referenceVideo", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 2 }]
    : [];
  const v6Switches: readonly GenerationPort[] = v6
    ? [
        { name: "multiClip", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
        { name: "seed", value: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 }, minItems: 0, maxItems: 1 },
      ]
    : [];
  const v6Requires: readonly GenerationPortRequirement[] = v6
    ? [
        // A run that bridges two frames, and one that carries subject references, is a single
        // continuous shot rather than several cuts.
        { kind: "atMostOneOf", ports: ["multiClip", "lastFrame"] },
        { kind: "atMostOneOf", ports: ["multiClip", "referenceImage"] },
        // The reference videos carry the length of the generated run.
        { kind: "atMostOneOf", ports: ["duration", "referenceVideo"] },
      ]
    : [];
  return sealGenerationPortTable({
    model,
    result: "video",
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
      { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: v6 ? 10 : 7 },
      ...referenceVideo,
      // Required except in the reference-video mode, which pixverseRequestValidator states.
      { name: "duration", value: { kind: "number", integer: true, minimum: 1, maximum: 15 }, minItems: 0, maxItems: 1 },
      { name: "quality", value: { kind: "enum", values: [...PIXVERSE_QUALITIES] }, minItems: 1, maxItems: 1 },
      {
        name: "aspectRatio",
        value: { kind: "enum", values: v6 ? [...PIXVERSE_V6_ASPECT_RATIOS] : [...PIXVERSE_ASPECT_RATIOS] },
        minItems: 0,
        maxItems: 1,
      },
      { name: "generateAudio", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      ...v6Switches,
    ],
    requires: [
      // A last frame states where a run that already has a first frame ends.
      { kind: "requiresPresent", port: "lastFrame", needs: ["firstFrame"] },
      // A run that starts from a frame inherits that frame's shape.
      { kind: "atMostOneOf", ports: ["aspectRatio", "firstFrame"] },
      // Frames and subject references are separate ways of placing an image in the run.
      { kind: "atMostOneOf", ports: ["referenceImage", "firstFrame"] },
      ...v6Requires,
    ],
  });
}

export const pixversePorts: Readonly<Record<PixverseModel, GenerationPortTable>> = {
  "pixverse-v6": pixversePortTable("pixverse-v6"),
  "pixverse-c1": pixversePortTable("pixverse-c1"),
};

export function sealPixverseRequest(
  model: PixverseModel,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  return sealGenerationPortRequest(pixversePorts[model], ports);
}

const pixverseBaseDefinition = defineExactModelModule({
  module: pixverseModuleRef,
  endpoints: ([["v6", "pixverse-v6"], ["c1", "pixverse-c1"]] as const).map(([key, model]) => ({
    key,
    requestTypeName: model === "pixverse-v6" ? "PixverseV6Request" : "PixverseC1Request",
    producerName: `request-${model}`,
    ports: pixversePorts[model],
    validateRequest: pixverseRequestValidator(model),
  })),
});

export const pixverseEndpoints = pixverseBaseDefinition.endpoints;
export const pixverseEndpointsByModel = {
  "pixverse-v6": pixverseEndpoints.v6!,
  "pixverse-c1": pixverseEndpoints.c1!,
} as const;
export const pixverseComponent = pixverseBaseDefinition.component;

const surfaceOutputs = Object.values(pixverseEndpoints).flatMap((endpoint) => [
  endpoint.draftType,
  ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
]);

const pixverseCommonAttributes: readonly SurfaceAttributeVocabulary[] = [
  { name: "id", kind: "identifier", required: true,
    summary: "Names this generation so its video Artifact can be referenced elsewhere in the Source." },
  { name: "model", kind: "literal", required: true, values: ["v6", "pixverse-v6", "c1", "pixverse-c1"],
    summary: "Chooses the exact PixVerse model that renders the video." },
  { name: "prompt", kind: "reference", required: true, accepts: [textTypes.text],
    summary: "The Text edge describing the shot, including any spoken line the model should voice." },
  { name: "quality", kind: "literal", required: true, values: [...PIXVERSE_QUALITIES],
    summary: "The size band the model renders at." },
  { name: "generate-audio", kind: "literal", required: false, values: ["true", "false"],
    summary: "Renders an audio track alongside the picture." },
  { name: "seed", kind: "literal", required: false,
    summary: "Seeds V6's sampling so a rerun stays close to this one." },
];

const pixverseAspectRatio: SurfaceAttributeVocabulary = {
  name: "aspect-ratio", kind: "literal", required: false, values: [...PIXVERSE_V6_ASPECT_RATIOS],
  summary: "The Frame shape of the generated video.",
};

const pixverseVideoPort: readonly SurfacePortVocabulary[] = [{
  name: "video",
  type: artifactTypes.blob,
  summary: "The generated video, addressed as `<id>.video`.",
}];

const pixverseQualityNote = "`quality` is `360p`, `540p`, `720p` or `1080p`, and `duration` is 1 to 15 seconds.";
const pixversePromptNote = "A spoken line belongs in the prompt; the model exposes no separate voice, language or dialogue field.";
const pixverseModelNote = "V6 accepts `seed` and up to ten references; C1 accepts up to seven references.";

export const pixverseMarkupSurfaces = [
  {
    name: "video",
    tag: "Video",
    mode: "structured" as const,
    outputs: surfaceOutputs,
    vocabulary: {
      summary: "Generates one video with an exact PixVerse model from a Text prompt, optionally starting from a frame or bridging two.",
      attributes: [
        ...pixverseCommonAttributes,
        { name: "duration", kind: "literal" as const, required: true,
          summary: "How many seconds of video to render, from 1 to 15." },
        { name: "first-frame", kind: "reference" as const, required: false, accepts: [artifactTypes.blob],
          summary: "Starts the video from one image Artifact." },
        { name: "last-frame", kind: "reference" as const, required: false, accepts: [artifactTypes.blob],
          summary: "Ends the video on one image Artifact, bridging from the first frame." },
        pixverseAspectRatio,
        { name: "multi-clip", kind: "literal" as const, required: false, values: ["true", "false"],
          summary: "Renders the prompt as several cuts instead of one continuous shot, on V6." },
      ],
      ports: pixverseVideoPort,
      example: `<pix:Video
  id="opening"
  model="v6"
  prompt={line}
  duration="5"
  quality="720p"
  aspect-ratio="9:16"
  generate-audio="true"
/>`,
      notes: [
        pixverseQualityNote,
        pixverseModelNote,
        "A run that starts from a frame takes its shape from that frame, so `aspect-ratio` states the shape only for a prompt-only run.",
        "A `last-frame` bridges from the `first-frame` into one continuous shot, so it is not combined with `multi-clip`.",
        pixversePromptNote,
        "The element accepts no children and no text content.",
      ],
    },
  },
  {
    name: "reference-video",
    tag: "ReferenceVideo",
    mode: "structured" as const,
    outputs: surfaceOutputs,
    vocabulary: {
      summary: "Generates one video with an exact PixVerse model from a Text prompt and the image or video subjects it carries.",
      attributes: [
        ...pixverseCommonAttributes,
        { name: "duration", kind: "literal" as const, required: false,
          summary: "How many seconds of video to render, from 1 to 15; video references carry their own length." },
        pixverseAspectRatio,
      ],
      children: [{
        tag: "Reference",
        cardinality: "many" as const,
        summary: "Attaches one subject Artifact the model generates from, chosen by an `image` or `video` reference.",
        attributes: [
          { name: "image", kind: "reference" as const, required: false, accepts: [artifactTypes.blob],
            summary: "Selects the image Artifact whose subject the generated video carries." },
          { name: "video", kind: "reference" as const, required: false, accepts: [artifactTypes.blob],
            summary: "Selects the video Artifact whose motion and subject the generated video carries." },
        ],
      }],
      ports: pixverseVideoPort,
      example: `<pix:ReferenceVideo id="fusion" model="v6" prompt={outfit} duration="5" quality="720p" aspect-ratio="16:9">
  <pix:Reference image={character.image}/>
  <pix:Reference image={clothes.image}/>
</pix:ReferenceVideo>`,
      notes: [
        pixverseQualityNote,
        pixverseModelNote,
        "The prompt addresses the references in order as `@ref_1`, `@ref_2` and so on.",
        "`Reference` carries exactly one of `image` or `video`, and is empty.",
        "V6 accepts up to two video references totalling 15 seconds, which carry the length of the run in place of `duration`; `aspect-ratio=\"auto\"` takes their shape.",
        pixversePromptNote,
      ],
    },
  },
] as const;

export const pixverseManifest = {
  ...pixverseBaseDefinition.manifest,
};
export const pixverseDefinition = {
  ...pixverseBaseDefinition,
  manifest: pixverseManifest,
};
