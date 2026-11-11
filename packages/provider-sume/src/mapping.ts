import type { ModuleRef } from "@hypit/hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };
const MINIMAX: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };
const GROK: ModuleRef = { name: "@hypit/grok-imagine", version: "1" };
const PIXVERSE: ModuleRef = { name: "@hypit/pixverse", version: "1" };
const GPT_IMAGE: ModuleRef = { name: "@hypit/gpt-image", version: "1" };
const NANO_BANANA: ModuleRef = { name: "@hypit/nano-banana", version: "1" };
const SEEDREAM: ModuleRef = { name: "@hypit/seedream", version: "1" };

/**
 * Sume catalog ids and the body fields each one documents.
 *
 * Video models post to `POST /v1/video-router/generate`, whose body carries every reference as a
 * flat URL field. Image models post to `POST /v1/images`; its `input_references` array of
 * `{ type, image_url: { url } }` objects is built in routes.ts from the `images` URLs written here.
 * Ports the service has no field for are written under their own names so routes.ts can drop an
 * authored "off" value and refuse an authored "on" value before anything is uploaded.
 */
const seedanceFields = {
  prompt: { as: "value", field: "prompt" },
  firstFrame: { as: "url", field: "image_url", resourceFields: ["personReference"] },
  lastFrame: { as: "url", field: "end_image_url", resourceFields: ["personReference"] },
  referenceImage: { as: "urlArray", field: "reference_image_urls", resourceFields: ["personReference"] },
  referenceVideo: { as: "urlArray", field: "reference_video_urls", resourceFields: ["personReference"] },
  referenceAudio: { as: "urlArray", field: "reference_audio_urls" },
  duration: { as: "value", field: "duration" },
  aspectRatio: { as: "value", field: "aspect_ratio" },
  resolution: { as: "value", field: "resolution" },
  generateAudio: { as: "value", field: "generate_audio" },
  webSearch: { as: "value", field: "web_search" },
} as const satisfies GenerationWireMapping["fields"];

const seedance = (name: string): GenerationWireMapping => ({
  capability: { module: SEEDANCE, name }, result: "video", routes: [{ model: name }], fields: seedanceFields,
});

const pixverse = (name: "pixverse-v6" | "pixverse-c1"): GenerationWireMapping => ({
  capability: { module: PIXVERSE, name }, result: "video", routes: [{ model: name }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    firstFrame: { as: "url", field: "image_url" },
    lastFrame: { as: "url", field: "end_image_url" },
    referenceImage: { as: "urlArray", field: "reference_image_urls" },
    ...(name === "pixverse-v6" ? {
      referenceVideo: { as: "urlArray" as const, field: "reference_video_urls" },
      multiClip: { as: "value" as const, field: "multi_clip" },
      seed: { as: "value" as const, field: "seed" },
    } : {}),
    duration: { as: "value", field: "duration" },
    // PixVerse's quality band is Sume's resolution.
    quality: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    generateAudio: { as: "value", field: "generate_audio" },
  },
});

export const sumeMappings: readonly GenerationWireMapping[] = [
  seedance("seedance-2"),
  seedance("seedance-2-fast"),
  seedance("seedance-2-mini"),
  seedance("seedance-2.5"),
  {
    capability: { module: MINIMAX, name: "minimax-h3" }, result: "video",
    routes: [{ model: "minimax-h3" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      firstFrame: { as: "url", field: "image_url" },
      lastFrame: { as: "url", field: "end_image_url" },
      referenceImage: { as: "urlArray", field: "reference_image_urls" },
      referenceVideo: { as: "urlArray", field: "reference_video_urls" },
      referenceAudio: { as: "urlArray", field: "reference_audio_urls" },
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
      images: { as: "urlArray", field: "images" },
      duration: { as: "value", field: "duration" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
    },
  },
  pixverse("pixverse-v6"),
  pixverse("pixverse-c1"),
  {
    capability: { module: GPT_IMAGE, name: "gpt-image-2" }, result: "image",
    routes: [{ model: "openai/gpt-image-2" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      images: { as: "urlArray", field: "images" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      background: { as: "value", field: "background" },
    },
  },
  // Sume serves Nano Banana 2 as its successor, Nano Banana 2.1.
  ...([["nano-banana-2", "google/nano-banana-2.1"], ["nano-banana-pro", "google/nano-banana-pro"]] as const).map(([name, model]) => ({
    capability: { module: NANO_BANANA, name }, result: "image" as const,
    routes: [{ model }],
    fields: {
      prompt: { as: "value" as const, field: "prompt" },
      images: { as: "urlArray" as const, field: "images" },
      aspectRatio: { as: "value" as const, field: "aspect_ratio" },
      resolution: { as: "value" as const, field: "resolution" },
      outputFormat: { as: "value" as const, field: "output_format" },
    },
  })),
  {
    capability: { module: SEEDREAM, name: "seedream-5-lite" }, result: "image",
    routes: [{ model: "bytedance-seed/seedream-5-lite" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      images: { as: "urlArray", field: "images" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      quality: { as: "value", field: "quality" },
      outputFormat: { as: "value", field: "output_format" },
      nsfwCheck: { as: "value", field: "nsfw_check" },
    },
  },
];
