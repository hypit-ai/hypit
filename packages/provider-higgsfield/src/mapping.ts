import type { ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };

/**
 * Higgsfield names one endpoint path per model and workflow, so a route's `model` is the path
 * under the API base rather than a body field. The body is that workflow's documented input.
 * The first route whose ports are present wins; the Seedance port rules keep frames and
 * references mutually exclusive, so at most one reference route can match.
 */
const seedanceFields = {
  prompt: { as: "value", field: "prompt" },
  aspectRatio: { as: "value", field: "aspect_ratio" },
  duration: { as: "value", field: "duration" },
  resolution: { as: "value", field: "resolution" },
  generateAudio: { as: "value", field: "generate_audio" },
  // Higgsfield documents no web search field; `normalize` drops it and `rejection` refuses `true`.
  webSearch: { as: "value", field: "web_search" },
  firstFrame: { as: "url", field: "image_url", resourceFields: ["personReference"] },
  lastFrame: { as: "url", field: "end_image_url", resourceFields: ["personReference"] },
  referenceImage: { as: "urlArray", field: "image_urls", resourceFields: ["personReference"] },
  referenceVideo: { as: "urlArray", field: "video_urls", resourceFields: ["personReference"] },
  referenceAudio: { as: "urlArray", field: "audio_urls" },
} as const satisfies GenerationWireMapping["fields"];

function seedance(name: string, base: string): GenerationWireMapping {
  return {
    capability: { module: SEEDANCE, name },
    result: "video",
    routes: [
      { model: `${base}/image-to-video`, whenPresent: ["firstFrame"] },
      { model: `${base}/reference-to-video`, whenPresent: ["referenceImage"] },
      { model: `${base}/reference-to-video`, whenPresent: ["referenceVideo"] },
      { model: `${base}/reference-to-video`, whenPresent: ["referenceAudio"] },
      { model: `${base}/text-to-video` },
    ],
    fields: seedanceFields,
  };
}

export const higgsfieldMappings: readonly GenerationWireMapping[] = [
  seedance("seedance-2", "bytedance/seedance-2.0"),
  seedance("seedance-2.5", "bytedance/seedance-2.5"),
];
