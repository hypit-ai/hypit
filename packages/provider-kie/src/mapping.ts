import type { CapabilityRef, ModuleRef } from "@narratage/protocol";
import type { GenerationWireMapping } from "@narratage/generation";

/**
 * How KIE names each model's declared input ports.
 *
 * This file contains data only. It references Capabilities by module and model
 * name, so this Provider package imports no model package: a model owns what it
 * accepts, and KIE owns what it calls that on its wire. Splitting one model
 * across several KIE endpoints is a KIE fact and lives in `routes`.
 */

/** Model packages this KIE release is written against. A version bump is a mapping review. */
const SEEDANCE: ModuleRef = { name: "@narratage/seedance", version: "1" };
const MINIMAX: ModuleRef = { name: "@narratage/minimax-h3", version: "1" };
const GEMINI: ModuleRef = { name: "@narratage/gemini-omni", version: "1" };
const GROK: ModuleRef = { name: "@narratage/grok-imagine", version: "1" };
const GPT_IMAGE: ModuleRef = { name: "@narratage/gpt-image", version: "1" };
const NANO_BANANA: ModuleRef = { name: "@narratage/nano-banana", version: "1" };
const SEEDREAM: ModuleRef = { name: "@narratage/seedream", version: "1" };

/** KIE keeps each reference modality in its own array, as its schema documents. */
const referenceFields = {
  referenceImage: { as: "urlArray", field: "reference_image_urls" },
  referenceVideo: { as: "urlArray", field: "reference_video_urls" },
  referenceAudio: { as: "urlArray", field: "reference_audio_urls" },
} as const;

function seedanceMapping(model: string, kieModel: string): GenerationWireMapping {
  return {
    capability: { module: SEEDANCE, name: model },
    result: "video",
    routes: [{ model: kieModel }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      ...referenceFields,
      firstFrame: { as: "url", field: "first_frame_url" },
      lastFrame: { as: "url", field: "last_frame_url" },
      resolution: { as: "value", field: "resolution" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      duration: { as: "value", field: "duration" },
      generateAudio: { as: "value", field: "generate_audio" },
      webSearch: { as: "value", field: "web_search" },
    },
  };
}

const minimaxMapping: GenerationWireMapping = {
  capability: { module: MINIMAX, name: "minimax-h3" },
  result: "video",
  routes: [
    { model: "minimax-h3/image-to-video", whenPresent: ["firstFrame"] },
    { model: "minimax-h3/reference-to-video", whenPresent: ["referenceImage"] },
    { model: "minimax-h3/reference-to-video", whenPresent: ["referenceVideo"] },
    { model: "minimax-h3/text-to-video" },
  ],
  fields: {
    prompt: { as: "value", field: "prompt" },
    duration: { as: "value", field: "duration" },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    ...referenceFields,
    firstFrame: { as: "url", field: "first_frame_url" },
    lastFrame: { as: "url", field: "last_frame_url" },
  },
};

const geminiMapping: GenerationWireMapping = {
  capability: { module: GEMINI, name: "gemini-omni-video" },
  result: "video",
  routes: [{ model: "gemini-omni-video" }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    duration: { as: "string", field: "duration" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    resolution: { as: "value", field: "resolution" },
    seed: { as: "value", field: "seed" },
    images: { as: "urlArray", field: "image_urls" },
    audioIds: { as: "valueArray", field: "audio_ids" },
    characterIds: { as: "valueArray", field: "character_ids" },
    excerpts: {
      as: "itemObject",
      field: "video_list",
      urlKey: "url",
      fieldKeys: { startSec: "start", endSec: "ends" },
    },
  },
};

const grokVideoMapping: GenerationWireMapping = {
  capability: { module: GROK, name: "grok-imagine-video" },
  result: "video",
  routes: [
    { model: "grok-imagine/image-to-video", whenPresent: ["images"] },
    { model: "grok-imagine/text-to-video" },
  ],
  fields: {
    prompt: { as: "value", field: "prompt" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    resolution: { as: "value", field: "resolution" },
    duration: { as: "string", field: "duration" },
    images: { as: "urlArray", field: "image_urls" },
    sourceTaskId: { as: "value", field: "task_id" },
  },
  constants: { mode: "normal" },
};

const grokPreviewMapping: GenerationWireMapping = {
  capability: { module: GROK, name: "grok-imagine-video-1.5-preview" },
  result: "video",
  routes: [{ model: "grok-imagine-video-1-5-preview" }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    resolution: { as: "value", field: "resolution" },
    duration: { as: "value", field: "duration" },
    images: { as: "urlArray", field: "image_urls" },
  },
};

const gptImageMapping: GenerationWireMapping = {
  capability: { module: GPT_IMAGE, name: "gpt-image-2" },
  result: "image",
  routes: [
    { model: "gpt-image-2-image-to-image", whenPresent: ["images"] },
    { model: "gpt-image-2-text-to-image" },
  ],
  fields: {
    prompt: { as: "value", field: "prompt" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    resolution: { as: "value", field: "resolution" },
    images: { as: "urlArray", field: "input_urls" },
  },
};

function nanoBananaMapping(model: string): GenerationWireMapping {
  return {
    capability: { module: NANO_BANANA, name: model },
    result: "image",
    routes: [{ model }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      /** KIE expects the key even with no input image. */
      images: { as: "urlArray", field: "image_input", whenAbsent: [] },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      outputFormat: { as: "value", field: "output_format" },
    },
  };
}

const seedreamMapping: GenerationWireMapping = {
  capability: { module: SEEDREAM, name: "seedream-5-lite" },
  result: "image",
  routes: [
    { model: "seedream/5-lite-image-to-image", whenPresent: ["images"] },
    { model: "seedream/5-lite-text-to-image" },
  ],
  fields: {
    prompt: { as: "value", field: "prompt" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    quality: { as: "value", field: "quality" },
    outputFormat: { as: "value", field: "output_format" },
    nsfwCheck: { as: "value", field: "nsfw_checker" },
    images: { as: "urlArray", field: "image_urls" },
  },
};

export const kieModelCatalog: readonly GenerationWireMapping[] = [
  seedanceMapping("seedance-2", "bytedance/seedance-2"),
  seedanceMapping("seedance-2-fast", "bytedance/seedance-2-fast"),
  seedanceMapping("seedance-2-mini", "bytedance/seedance-2-mini"),
  {
    ...seedanceMapping("seedance-2.5", "bytedance/seedance-2-5"),
    // These are KIE output-envelope choices, not Seedance model inputs.
    constants: { return_last_frame: false, output_format: "mp4" },
  },
  minimaxMapping,
  geminiMapping,
  grokVideoMapping,
  grokPreviewMapping,
  gptImageMapping,
  nanoBananaMapping("nano-banana-2"),
  nanoBananaMapping("nano-banana-pro"),
  seedreamMapping,
];

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

const catalogByCapability = new Map(kieModelCatalog.map((item) => [capabilityKey(item.capability), item]));

export function kieMappingForCapability(capability: CapabilityRef): GenerationWireMapping | undefined {
  return catalogByCapability.get(capabilityKey(capability));
}

export function verifyKieModelCatalog(): void {
  if (catalogByCapability.size !== kieModelCatalog.length) {
    throw new Error("KIE model catalog repeats a capability");
  }
  kieModelCatalog.forEach((item) => {
    if (item.capability.name.trim().length === 0) throw new Error("KIE model catalog contains an empty model");
  });
}
