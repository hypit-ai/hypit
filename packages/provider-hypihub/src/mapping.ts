import { capabilityKey } from "@hypit/hypit/protocol";
import type { CapabilityRef } from "@hypit/hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation/provider";
import { elevenLabsSpeechModuleRef } from "@hypit/elevenlabs-speech";
import { fishAudioSpeechModuleRef } from "@hypit/fishaudio-speech";
import { gptImageModuleRef } from "@hypit/gpt-image";
import { grokImagineModuleRef } from "@hypit/grok-imagine";
import { minimaxH3ModuleRef } from "@hypit/minimax-h3";
import { mimoSpeechModuleRef } from "@hypit/mimo-speech";
import { nanoBananaModuleRef } from "@hypit/nano-banana";
import { pixverseModuleRef } from "@hypit/pixverse";
import { seedanceModuleRef } from "@hypit/seedance";
import { seedreamModuleRef } from "@hypit/seedream";
import { volcengineMattingModuleRef } from "@hypit/volcengine-matting";

export type HypiHubGenerationMapping = GenerationWireMapping & { readonly media: "audio" | "image" | "video" };

const seedance = (name: string): HypiHubGenerationMapping => ({
  capability: { module: seedanceModuleRef, name }, media: "video", routes: [{ model: name }],
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
const pixverse = (name: string, model: string): HypiHubGenerationMapping => ({
  capability: { module: pixverseModuleRef, name }, media: "video", routes: [{ model }],
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

export const hypiHubMappings: readonly HypiHubGenerationMapping[] = [
  {
    capability: { module: volcengineMattingModuleRef, name: "matte-portrait-video" },
    media: "video", routes: [{ model: "matte-portrait-video" }],
    fields: {
      source: { as: "url", field: "ref_video_url" },
      format: { as: "value", field: "format" },
    },
  },
  seedance("seedance-2"),
  seedance("seedance-2-fast"),
  seedance("seedance-2-mini"),
  seedance("seedance-2.5"),
  pixverse("pixverse-v6", "pixverse/v6"),
  pixverse("pixverse-c1", "pixverse/c1"),
  {
    capability: { module: gptImageModuleRef, name: "gpt-image-2" }, media: "image", routes: [{ model: "gpt-image-2" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      background: { as: "value", field: "background" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  ...(["nano-banana-2", "nano-banana-pro"] as const).map((model) => ({
    capability: { module: nanoBananaModuleRef, name: model }, media: "image" as const, routes: [{ model }],
    fields: {
      prompt: { as: "value" as const, field: "prompt" },
      aspectRatio: { as: "value" as const, field: "aspect_ratio" },
      resolution: { as: "value" as const, field: "resolution" },
      images: { as: "itemObject" as const, field: "reference_images", urlKey: "url", fieldKeys: {} },
      outputFormat: { as: "value" as const, field: "output_format" },
    },
  })),
  {
    capability: { module: seedreamModuleRef, name: "seedream-5-lite" }, media: "image", routes: [{ model: "seedream-5-lite" }],
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
    capability: { module: minimaxH3ModuleRef, name: "minimax-h3" }, media: "video", routes: [{ model: "minimax-h3" }],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      referenceImage: { as: "urlArray", field: "reference_image_urls" },
      referenceVideo: { as: "urlArray", field: "reference_videos" },
      referenceAudio: { as: "urlArray", field: "reference_audios" },
      firstFrame: { as: "url", field: "first_frame" },
      lastFrame: { as: "url", field: "last_frame" },
    },
  },
  {
    capability: { module: grokImagineModuleRef, name: "grok-imagine-video" }, media: "video", routes: [{ model: "grok-imagine-video" }],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  {
    capability: { module: grokImagineModuleRef, name: "grok-imagine-video-1.5-preview" }, media: "video", routes: [
      { model: "grok-imagine-video-1.5-preview" },
    ],
    fields: {
      prompt: { as: "value", field: "prompt" }, duration: { as: "value", field: "seconds" },
      resolution: { as: "value", field: "resolution" }, aspectRatio: { as: "value", field: "aspect_ratio" },
      images: { as: "itemObject", field: "reference_images", urlKey: "url", fieldKeys: {} },
    },
  },
  {
    capability: { module: mimoSpeechModuleRef, name: "mimo-v2.5-tts-voicedesign" }, media: "audio", routes: [{ model: "mimo-v2.5-tts-voicedesign" }],
    fields: {
      text: { as: "value", field: "input" },
      voiceDescription: { as: "value", field: "voice_description" },
    },
  },
  {
    capability: { module: mimoSpeechModuleRef, name: "mimo-v2.5-tts-voiceclone" }, media: "audio", routes: [{ model: "mimo-v2.5-tts-voiceclone" }],
    fields: {
      text: { as: "value", field: "input" },
      instruction: { as: "value", field: "prompt" },
      voiceReference: { as: "urlArray", field: "reference_audio" },
    },
  },
  {
    capability: { module: fishAudioSpeechModuleRef, name: "voice-design-1" }, media: "audio", routes: [{ model: "fishaudio/voice-design-1" }],
    fields: {
      text: { as: "value", field: "input" },
      voiceDescription: { as: "value", field: "voice_description" },
    },
  },
  {
    capability: { module: fishAudioSpeechModuleRef, name: "voice-clone" }, media: "audio", routes: [{ model: "fishaudio/voice-clone" }],
    // Fish Audio titles its transient cloned voice; the title has no authored meaning.
    constants: { voice_description: "reference" },
    fields: {
      text: { as: "value", field: "input" },
      voiceReference: { as: "urlArray", field: "reference_audio" },
    },
  },
  {
    capability: { module: elevenLabsSpeechModuleRef, name: "eleven_ttv_v3" }, media: "audio", routes: [{ model: "eleven_ttv_v3" }],
    fields: {
      text: { as: "value", field: "input" },
      voiceDescription: { as: "value", field: "voice_description" },
    },
  },
];

const byCapability = new Map(hypiHubMappings.map((mapping) => [capabilityKey(mapping.capability), mapping]));

export function hypiHubMappingForCapability(capability: CapabilityRef): HypiHubGenerationMapping | undefined {
  return byCapability.get(capabilityKey(capability));
}
