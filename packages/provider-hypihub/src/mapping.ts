import type { CapabilityRef, ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

/** HypiHub model IDs and the normalized request fields they accept. */
const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };
const GPT_IMAGE: ModuleRef = { name: "@hypit/gpt-image", version: "1" };
const NANO_BANANA: ModuleRef = { name: "@hypit/nano-banana", version: "1" };
const SEEDREAM: ModuleRef = { name: "@hypit/seedream", version: "1" };
const MINIMAX: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };
const GROK: ModuleRef = { name: "@hypit/grok-imagine", version: "1" };
const PIXVERSE: ModuleRef = { name: "@hypit/pixverse", version: "1" };
const MIMO_SPEECH: ModuleRef = { name: "@hypit/mimo-speech", version: "1" };
const FISHAUDIO_SPEECH: ModuleRef = { name: "@hypit/fishaudio-speech", version: "1" };
const ELEVENLABS_SPEECH: ModuleRef = { name: "@hypit/elevenlabs-speech", version: "1" };

const seedance = (name: string): GenerationWireMapping => ({
  capability: { module: SEEDANCE, name }, result: "video", routes: [{ model: name }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    referenceImage: { as: "urlArray", field: "reference_image_urls", resourceFields: ["personReference"] },
    referenceVideo: { as: "urlArray", field: "reference_videos", resourceFields: ["personReference"] },
    referenceAudio: { as: "urlArray", field: "reference_audios" },
    firstFrame: { as: "url", field: "first_frame", resourceFields: ["personReference"] },
    lastFrame: { as: "url", field: "last_frame", resourceFields: ["personReference"] },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    duration: { as: "value", field: "seconds" },
    generateAudio: { as: "value", field: "generate_audio" },
    webSearch: { as: "value", field: "web_search" },
  },
});

/**
 * PixVerse V6 and C1 on `POST /v1/videos`. Both take the same body; V6 additionally accepts
 * reference videos, which carry the length of the run in place of `seconds`. The model's own
 * `quality` band is HypiHub's `resolution`.
 */
const pixverse = (name: string, model: string): GenerationWireMapping => ({
  capability: { module: PIXVERSE, name }, result: "video", routes: [{ model }],
  fields: {
    prompt: { as: "value", field: "prompt" },
    firstFrame: { as: "url", field: "first_frame" },
    lastFrame: { as: "url", field: "last_frame" },
    referenceImage: { as: "urlArray", field: "reference_image_urls" },
    ...(name === "pixverse-v6" ? { referenceVideo: { as: "urlArray" as const, field: "reference_videos" } } : {}),
    duration: { as: "value", field: "seconds" },
    quality: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "aspect_ratio" },
    generateAudio: { as: "value", field: "generate_audio" },
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
  seedance("seedance-2"),
  seedance("seedance-2-fast"),
  seedance("seedance-2-mini"),
  seedance("seedance-2.5"),
  pixverse("pixverse-v6", "pixverse/v6"),
  pixverse("pixverse-c1", "pixverse/c1"),
  {
    capability: { module: GPT_IMAGE, name: "gpt-image-2" }, result: "image", routes: [{ model: "gpt-image-2" }],
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
    capability: { module: SEEDREAM, name: "seedream-5-lite" }, result: "image", routes: [{ model: "seedream-5-lite" }],
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
    capability: { module: MINIMAX, name: "minimax-h3" }, result: "video", routes: [{ model: "minimax-h3" }],
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
    capability: { module: GROK, name: "grok-imagine-video" }, result: "video", routes: [{ model: "grok-imagine-video" }],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  {
    capability: { module: GROK, name: "grok-imagine-video-1.5-preview" }, result: "video", routes: [
      { model: "grok-imagine-video-1.5-preview" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  {
    capability: { module: MIMO_SPEECH, name: "mimo-v2.5-tts-voicedesign" }, result: "audio", routes: [{ model: "mimo-v2.5-tts-voicedesign" }],
    fields: {
      text: { as: "value", field: "input" },
      voiceDescription: { as: "value", field: "voice_description" },
    },
  },
  {
    capability: { module: MIMO_SPEECH, name: "mimo-v2.5-tts-voiceclone" }, result: "audio", routes: [{ model: "mimo-v2.5-tts-voiceclone" }],
    fields: {
      text: { as: "value", field: "input" },
      instruction: { as: "value", field: "prompt" },
      voiceReference: { as: "urlArray", field: "reference_audio" },
    },
  },
  {
    capability: { module: FISHAUDIO_SPEECH, name: "voice-design-1" }, result: "audio", routes: [{ model: "fishaudio/voice-design-1" }],
    fields: {
      text: { as: "value", field: "input" },
      voiceDescription: { as: "value", field: "voice_description" },
    },
  },
  {
    capability: { module: FISHAUDIO_SPEECH, name: "voice-clone" }, result: "audio", routes: [{ model: "fishaudio/voice-clone" }],
    // Fish Audio titles its transient cloned voice; the title has no authored meaning.
    constants: { voice_description: "reference" },
    fields: {
      text: { as: "value", field: "input" },
      voiceReference: { as: "urlArray", field: "reference_audio" },
    },
  },
  {
    capability: { module: ELEVENLABS_SPEECH, name: "eleven_ttv_v3" }, result: "audio", routes: [{ model: "eleven_ttv_v3" }],
    fields: {
      text: { as: "value", field: "input" },
      voiceDescription: { as: "value", field: "voice_description" },
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
