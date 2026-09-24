import type { ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };

/**
 * MuAPI's Seedance 2.5 text/image endpoints share the documented prompt,
 * resolution, duration and aspect-ratio fields. The remaining model ports stay
 * in the mapping so the provider can report unsupported requests before it
 * uploads media or submits a billable task.
 */
const seedanceFields = {
  prompt: { as: "value", field: "prompt" },
  aspectRatio: { as: "value", field: "aspect_ratio" },
  duration: { as: "value", field: "duration" },
  resolution: { as: "value", field: "resolution" },
  firstFrame: { as: "url", field: "image_url", resourceFields: ["personReference"] },
  lastFrame: { as: "url", field: "last_image", resourceFields: ["personReference"] },
  referenceImage: { as: "urlArray", field: "images_list", resourceFields: ["personReference"] },
  referenceVideo: { as: "urlArray", field: "video_urls", resourceFields: ["personReference"] },
  referenceAudio: { as: "urlArray", field: "audio_urls" },
  generateAudio: { as: "value", field: "generate_audio" },
  webSearch: { as: "value", field: "web_search" },
} as const satisfies GenerationWireMapping["fields"];

export const muApiMappings: readonly GenerationWireMapping[] = [{
  capability: { module: SEEDANCE, name: "seedance-2.5" },
  result: "video",
  routes: [
    { model: "seedance-2.5-image-to-video", whenPresent: ["firstFrame"] },
    { model: "seedance-2.5-text-to-video" },
  ],
  fields: seedanceFields,
}];
