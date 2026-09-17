import type { ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const MINIMAX: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };
const GROK: ModuleRef = { name: "@hypit/grok-imagine", version: "1" };
const GPT_IMAGE: ModuleRef = { name: "@hypit/gpt-image", version: "1" };
const NANO_BANANA: ModuleRef = { name: "@hypit/nano-banana", version: "1" };

/**
 * Pollo generation paths and the `input` fields each documents. The route model is the request
 * path under the Pollo platform base URL. Reference fields prefixed `refs_` are folded into MiniMax's
 * typed `refs` array by routes.ts.
 */
export const polloMappings: readonly GenerationWireMapping[] = [
  {
    capability: { module: MINIMAX, name: "minimax-h3" }, result: "video", routes: [{ model: "/v1/generation/minimax/minimax-h3/video" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      duration: { as: "value", field: "duration" },
      resolution: { as: "value", field: "resolution" },
      aspectRatio: { as: "value", field: "aspectRatio" },
      firstFrame: { as: "url", field: "image" },
      lastFrame: { as: "url", field: "imageTail" },
      referenceImage: { as: "urlArray", field: "refs_image" },
      referenceVideo: { as: "urlArray", field: "refs_video" },
      referenceAudio: { as: "urlArray", field: "refs_audio" },
    },
  },
  {
    capability: { module: GROK, name: "grok-imagine-video-1.5-preview" }, result: "video",
    routes: [{ model: "/v1/generation/xai/grok-imagine-video-1-5/video" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      resolution: { as: "value", field: "resolution" },
      duration: { as: "value", field: "duration" },
      images: { as: "urlArray", field: "images" },
    },
  },
  {
    capability: { module: GPT_IMAGE, name: "gpt-image-2" }, result: "image", routes: [{ model: "/v1/generation/openai/gpt-image-2/image" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspectRatio" },
      resolution: { as: "value", field: "resolution" },
      background: { as: "value", field: "background" },
      images: { as: "urlArray", field: "images" },
    },
  },
  ...(["nano-banana-2", "nano-banana-pro"] as const).map((name): GenerationWireMapping => ({
    capability: { module: NANO_BANANA, name }, result: "image", routes: [{ model: `/v1/generation/google/${name}/image` }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      images: { as: "urlArray", field: "images" },
      aspectRatio: { as: "value", field: "aspectRatio" },
      resolution: { as: "value", field: "resolution" },
      outputFormat: { as: "value", field: "output_format" },
    },
  })),
];
