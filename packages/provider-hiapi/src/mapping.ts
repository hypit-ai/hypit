import type { GenerationWireMapping } from "@hypit/generation/provider";
import { gptImageModuleRef } from "@hypit/gpt-image";
import { grokImagineModuleRef } from "@hypit/grok-imagine";
import { minimaxH3ModuleRef } from "@hypit/minimax-h3";
import { nanoBananaModuleRef } from "@hypit/nano-banana";
import { seedanceModuleRef } from "@hypit/seedance";
import { seedreamModuleRef } from "@hypit/seedream";

export type HiApiMapping = GenerationWireMapping & { readonly media: "image" | "video" };

/**
 * HiAPI model IDs and the `input` fields each documents. A model whose HiAPI ID depends on the
 * request shape (text, frames or references) lists one route per shape; the first route whose
 * ports are present wins. `personReference` is accepted on Seedance visual references and not
 * transmitted: HiAPI has no field for it.
 */
const seedanceFields = {
  prompt: { as: "value", field: "prompt" },
  aspectRatio: { as: "value", field: "aspect_ratio" },
  duration: { as: "value", field: "duration" },
  resolution: { as: "value", field: "resolution" },
  firstFrame: { as: "url", field: "first_frame_url", resourceFields: ["personReference"] },
  lastFrame: { as: "url", field: "last_frame_url", resourceFields: ["personReference"] },
  referenceImage: { as: "urlArray", field: "reference_image_urls", resourceFields: ["personReference"] },
  referenceVideo: { as: "urlArray", field: "reference_video_urls", resourceFields: ["personReference"] },
  referenceAudio: { as: "urlArray", field: "reference_audio_urls" },
  generateAudio: { as: "value", field: "generate_audio" },
  webSearch: { as: "value", field: "web_search" },
} as const satisfies GenerationWireMapping["fields"];

const seedance2 = (name: string, model: string): HiApiMapping => ({
  capability: { module: seedanceModuleRef, name }, media: "video", routes: [{ model }], fields: seedanceFields,
});

export const hiApiMappings: readonly HiApiMapping[] = [
  seedance2("seedance-2", "seedance-2.0"),
  seedance2("seedance-2-fast", "seedance-2.0-fast"),
  seedance2("seedance-2-mini", "seedance-2.0-mini"),
  {
    capability: { module: seedanceModuleRef, name: "seedance-2.5" }, media: "video",
    routes: [
      { model: "seedance-2.5/reference-to-video", whenPresent: ["referenceVideo"] },
      { model: "seedance-2.5/image-to-video", whenPresent: ["firstFrame"] },
      { model: "seedance-2.5/image-to-video", whenPresent: ["referenceImage"] },
      { model: "seedance-2.5/image-to-video", whenPresent: ["referenceAudio"] },
      { model: "seedance-2.5/text-to-video" },
    ],
    fields: seedanceFields,
  },
  {
    capability: { module: seedreamModuleRef, name: "seedream-5-lite" }, media: "image",
    routes: [
      { model: "seedream-5.0-lite/image-to-image", whenPresent: ["images"] },
      { model: "seedream-5.0-lite/text-to-image" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      quality: { as: "value", field: "quality" },
      outputFormat: { as: "value", field: "output_format" },
      nsfwCheck: { as: "value", field: "nsfw_check" },
      images: { as: "urlArray", field: "image_urls" },
    },
  },
  {
    capability: { module: minimaxH3ModuleRef, name: "minimax-h3" }, media: "video", routes: [{ model: "minimax-h3" }],
    constants: { watermark: false },
    fields: {
      prompt: { as: "value", field: "prompt" },
      duration: { as: "value", field: "duration" },
      resolution: { as: "value", field: "resolution" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      firstFrame: { as: "url", field: "first_frame_image" },
      lastFrame: { as: "url", field: "last_frame_image" },
      referenceImage: { as: "urlArray", field: "image_urls" },
      referenceVideo: { as: "urlArray", field: "video_urls" },
      referenceAudio: { as: "urlArray", field: "audio_urls" },
    },
  },
  {
    capability: { module: gptImageModuleRef, name: "gpt-image-2" }, media: "image",
    routes: [
      { model: "gpt-image-2/image-to-image", whenPresent: ["images"] },
      { model: "gpt-image-2/text-to-image" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      background: { as: "value", field: "background" },
      images: { as: "urlArray", field: "input_urls" },
    },
  },
  ...([["nano-banana-2", "Nano-Banana-2"], ["nano-banana-pro", "Nano-Banana-Pro"]] as const).map(([name, model]): HiApiMapping => ({
    capability: { module: nanoBananaModuleRef, name }, media: "image", routes: [{ model }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      images: { as: "urlArray", field: "image_input" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      outputFormat: { as: "value", field: "output_format" },
    },
  })),
  {
    capability: { module: grokImagineModuleRef, name: "grok-imagine-video" }, media: "video",
    routes: [
      { model: "grok-imagine/image-to-video", whenPresent: ["images"] },
      { model: "grok-imagine/text-to-video" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      duration: { as: "value", field: "duration" },
      images: { as: "urlArray", field: "image_urls" },
    },
  },
  {
    capability: { module: grokImagineModuleRef, name: "grok-imagine-video-1.5-preview" }, media: "video",
    routes: [{ model: "grok-imagine-1.5/image-to-video" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      duration: { as: "value", field: "duration" },
      images: { as: "urlArray", field: "image_urls" },
    },
  },
];
