import type { CapabilityRef, ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

/** HypiHub model IDs and the normalized request fields they accept. */
const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };
const GPT_IMAGE: ModuleRef = { name: "@hypit/gpt-image", version: "1" };
const NANO_BANANA: ModuleRef = { name: "@hypit/nano-banana", version: "1" };
const SEEDREAM: ModuleRef = { name: "@hypit/seedream", version: "1" };
const MINIMAX: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };
const GROK: ModuleRef = { name: "@hypit/grok-imagine", version: "1" };
const TTS: ModuleRef = { name: "@hypit/tts", version: "1" };

const seedance = (name: string, model: string): GenerationWireMapping => ({
  capability: { module: SEEDANCE, name }, result: "video", routes: [{ model }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    referenceImage: { as: "urlArray", field: "reference_image_urls" },
    referenceVideo: { as: "urlArray", field: "reference_videos" },
    referenceAudio: { as: "urlArray", field: "reference_audios" },
    firstFrame: { as: "url", field: "first_frame" },
    lastFrame: { as: "url", field: "last_frame" },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    duration: { as: "value", field: "seconds" },
    generateAudio: { as: "value", field: "generate_audio" },
    webSearch: { as: "value", field: "web_search" },
  },
});

const voiceDesign = (model: string): GenerationWireMapping => ({
  capability: { module: TTS, name: model }, result: "audio", routes: [{ model }],
  fields: {
    text: { as: "value", field: "input" },
    voiceDescription: { as: "value", field: "voice_description" },
  },
});

export const hypiHubMappings: readonly GenerationWireMapping[] = [
  {
    capability: { module: { name: "@hypit/volcengine-matting", version: "1" }, name: "matte-portrait-video" },
    result: "video", routes: [{ model: "matte-portrait-video" }],
    fields: {
      source: { as: "url", field: "ref_video_url" },
      format: { as: "value", field: "format", whenAbsent: "WEBM" },
    },
  },
  seedance("seedance-2", "bytedance/seedance-2"),
  seedance("seedance-2-fast", "bytedance/seedance-2-fast"),
  seedance("seedance-2-mini", "bytedance/seedance-2-mini"),
  seedance("seedance-2.5", "bytedance/seedance-2-5"),
  {
    capability: { module: GPT_IMAGE, name: "gpt-image-2" }, result: "image", routes: [
      { model: "gpt-image-2-image-to-image", whenPresent: ["images"] },
      { model: "gpt-image-2-text-to-image" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution", whenAbsent: "1K" },
      background: { as: "value", field: "background" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  ...(["nano-banana-2", "nano-banana-pro"] as const).map((model) => ({
    capability: { module: NANO_BANANA, name: model }, result: "image" as const, routes: [{ model }],
    fields: {
      prompt: { as: "value" as const, field: "prompt" },
      aspectRatio: { as: "value" as const, field: "aspect_ratio" },
      resolution: { as: "value" as const, field: "resolution" },
      images: { as: "itemObject" as const, field: "reference_images", urlKey: "url", fieldKeys: {} },
      outputFormat: { as: "value" as const, field: "output_format" },
    },
  })),
  {
    capability: { module: SEEDREAM, name: "seedream-5-lite" }, result: "image", routes: [
      { model: "seedream/5-pro-image-to-image", whenPresent: ["images"] },
      { model: "seedream/5-lite-text-to-image" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
      quality: { as: "value", field: "quality" },
      outputFormat: { as: "value", field: "output_format" },
      nsfwCheck: { as: "value", field: "nsfw_checker" },
    },
  },
  {
    capability: { module: MINIMAX, name: "minimax-h3" }, result: "video", routes: [
      { model: "minimax-h3/image-to-video", whenPresent: ["lastFrame"] },
      { model: "minimax-h3/image-to-video", whenPresent: ["firstFrame"] },
      { model: "minimax-h3/reference-to-video", whenPresent: ["referenceImage"] },
      { model: "minimax-h3/reference-to-video", whenPresent: ["referenceVideo"] },
      { model: "minimax-h3/text-to-video" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution", whenAbsent: "2k" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      referenceImage: { as: "urlArray", field: "reference_image_urls" },
      referenceVideo: { as: "urlArray", field: "reference_videos" },
      referenceAudio: { as: "urlArray", field: "reference_audios" },
      firstFrame: { as: "url", field: "first_frame" },
      lastFrame: { as: "url", field: "last_frame" },
    },
  },
  {
    capability: { module: GROK, name: "grok-imagine-video" }, result: "video", routes: [
      { model: "grok-imagine/image-to-video", whenPresent: ["images"] },
      { model: "grok-imagine/text-to-video" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  {
    capability: { module: GROK, name: "grok-imagine-video-1.5-preview" }, result: "video", routes: [
      { model: "grok-imagine/image-to-video", whenPresent: ["images"] },
      { model: "grok-imagine/text-to-video" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  voiceDesign("mimo-v2.5-tts-voicedesign"),
  voiceDesign("eleven_ttv_v3"),
  {
    capability: { module: TTS, name: "mimo-v2.5-tts-voiceclone" }, result: "audio", routes: [{ model: "mimo-v2.5-tts-voiceclone" }],
    fields: {
      text: { as: "value", field: "input" },
      instruction: { as: "value", field: "prompt" },
      voiceReference: { as: "urlArray", field: "reference_audio" },
    },
  },
];

function capabilityKey(ref: CapabilityRef): string {
  return `${ref.module.name}@${ref.module.version}#${ref.name}`;
}

const byCapability = new Map(hypiHubMappings.map((mapping) => [capabilityKey(mapping.capability), mapping]));

export function hypiHubMappingForCapability(capability: CapabilityRef): GenerationWireMapping | undefined {
  return byCapability.get(capabilityKey(capability));
}
