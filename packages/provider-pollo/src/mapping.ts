import type { GenerationWireMapping } from "@hypit/generation/provider";
import { gptImageModuleRef } from "@hypit/gpt-image";
import { grokImagineModuleRef } from "@hypit/grok-imagine";
import { minimaxH3ModuleRef } from "@hypit/minimax-h3";
import { nanoBananaModuleRef } from "@hypit/nano-banana";

export type PolloMapping = GenerationWireMapping & { readonly media: "image" | "video" };

/**
 * Pollo generation paths and the `input` fields each documents. The route model is the request
 * path under the Pollo platform base URL. Reference fields prefixed `refs_` are folded into MiniMax's
 * typed `refs` array by routes.ts.
 */
export const polloMappings: readonly PolloMapping[] = [
  {
    capability: { module: minimaxH3ModuleRef, name: "minimax-h3" }, media: "video", routes: [{ model: "/v1/generation/minimax/minimax-h3/video" }],
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
    capability: { module: grokImagineModuleRef, name: "grok-imagine-video-1.5-preview" }, media: "video",
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
    capability: { module: gptImageModuleRef, name: "gpt-image-2" }, media: "image", routes: [{ model: "/v1/generation/openai/gpt-image-2/image" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspectRatio" },
      resolution: { as: "value", field: "resolution" },
      background: { as: "value", field: "background" },
      images: { as: "urlArray", field: "images" },
    },
  },
  ...(["nano-banana-2", "nano-banana-pro"] as const).map((name): PolloMapping => ({
    capability: { module: nanoBananaModuleRef, name }, media: "image", routes: [{ model: `/v1/generation/google/${name}/image` }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      images: { as: "urlArray", field: "images" },
      aspectRatio: { as: "value", field: "aspectRatio" },
      resolution: { as: "value", field: "resolution" },
      outputFormat: { as: "value", field: "output_format" },
    },
  })),
];
