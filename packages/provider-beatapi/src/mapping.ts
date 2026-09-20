import type { ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };
const MINIMAX: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };
const GROK: ModuleRef = { name: "@hypit/grok-imagine", version: "1" };
const GPT_IMAGE: ModuleRef = { name: "@hypit/gpt-image", version: "1" };
const NANO_BANANA: ModuleRef = { name: "@hypit/nano-banana", version: "1" };

/**
 * BeatAPI model aliases and the body fields each one documents. One alias serves every input mode,
 * so each Capability has a single route and the request shape alone decides which arrays travel.
 *
 * BeatAPI carries the opening and closing frames as one ordered `images` array rather than two
 * fields. The mapping writes them to `first_frame` and `last_frame`, which routes.ts folds into
 * that array; a mapping cannot write one wire field from two ports.
 */
const seedanceFields = {
  prompt: { as: "value", field: "prompt" },
  firstFrame: { as: "url", field: "first_frame", resourceFields: ["personReference"] },
  lastFrame: { as: "url", field: "last_frame", resourceFields: ["personReference"] },
  referenceImage: { as: "urlArray", field: "reference_images", resourceFields: ["personReference"] },
  referenceVideo: { as: "urlArray", field: "reference_videos", resourceFields: ["personReference"] },
  referenceAudio: { as: "urlArray", field: "reference_audios" },
  duration: { as: "value", field: "duration" },
  aspectRatio: { as: "value", field: "aspect_ratio" },
  resolution: { as: "value", field: "resolution" },
  generateAudio: { as: "value", field: "generate_audio" },
  webSearch: { as: "value", field: "web_search" },
} as const satisfies GenerationWireMapping["fields"];

const seedance = (name: string): GenerationWireMapping => ({
  capability: { module: SEEDANCE, name }, result: "video", routes: [{ model: name }], fields: seedanceFields,
});

export const beatApiMappings: readonly GenerationWireMapping[] = [
  seedance("seedance-2"),
  seedance("seedance-2-fast"),
  seedance("seedance-2-mini"),
  seedance("seedance-2.5"),
  {
    capability: { module: MINIMAX, name: "minimax-h3" }, result: "video",
    routes: [{ model: "minimax-h3" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      firstFrame: { as: "url", field: "first_frame" },
      lastFrame: { as: "url", field: "last_frame" },
      referenceImage: { as: "urlArray", field: "reference_images" },
      referenceVideo: { as: "urlArray", field: "reference_videos" },
      referenceAudio: { as: "urlArray", field: "reference_audios" },
      duration: { as: "value", field: "duration" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
    },
  },
  {
    capability: { module: GROK, name: "grok-imagine-video-1.5-preview" }, result: "video",
    routes: [{ model: "grok-imagine-video-1.5" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      images: { as: "urlArray", field: "reference_images" },
      duration: { as: "value", field: "duration" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
    },
  },
  {
    capability: { module: GPT_IMAGE, name: "gpt-image-2" }, result: "image",
    routes: [{ model: "gpt-image-2" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      images: { as: "urlArray", field: "images" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      background: { as: "value", field: "background" },
    },
  },
  ...(["nano-banana-2", "nano-banana-pro"] as const).map((model) => ({
    capability: { module: NANO_BANANA, name: model }, result: "image" as const,
    routes: [{ model }],
    fields: {
      prompt: { as: "value" as const, field: "prompt" },
      images: { as: "urlArray" as const, field: "images" },
      aspectRatio: { as: "value" as const, field: "aspect_ratio" },
      resolution: { as: "value" as const, field: "resolution" },
      outputFormat: { as: "value" as const, field: "output_format" },
    },
  })),
];
