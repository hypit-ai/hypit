import type { ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };
const SEEDREAM: ModuleRef = { name: "@hypit/seedream", version: "1" };
const MINIMAX: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };

/**
 * TokenDance model IDs and the request fields they accept. Media fields name the `role` of an Ark
 * or MiniMax `content` item; routes.ts folds them into that array. `personReference` is accepted
 * on visual references and not transmitted: neither protocol has a field for it.
 */
const seedance = (name: string, model: string): GenerationWireMapping => ({
  capability: { module: SEEDANCE, name }, result: "video", routes: [{ model }],
  fields: {
    prompt: { as: "value", field: "text" },
    referenceImage: { as: "urlArray", field: "reference_image", resourceFields: ["personReference"] },
    referenceVideo: { as: "urlArray", field: "reference_video", resourceFields: ["personReference"] },
    referenceAudio: { as: "urlArray", field: "reference_audio" },
    firstFrame: { as: "url", field: "first_frame", resourceFields: ["personReference"] },
    lastFrame: { as: "url", field: "last_frame", resourceFields: ["personReference"] },
    resolution: { as: "value", field: "resolution" },
    aspectRatio: { as: "value", field: "ratio" },
    duration: { as: "value", field: "duration" },
    generateAudio: { as: "value", field: "generate_audio" },
    webSearch: { as: "value", field: "web_search" },
  },
});

export const tokenDanceMappings: readonly GenerationWireMapping[] = [
  seedance("seedance-2", "seedance-2.0"),
  seedance("seedance-2-fast", "seedance-2.0-fast"),
  seedance("seedance-2-mini", "seedance-2.0-mini"),
  seedance("seedance-2.5", "seedance-2.5"),
  {
    capability: { module: SEEDREAM, name: "seedream-5-lite" }, result: "image", routes: [{ model: "seedream-5.0-lite" }],
    fields: {
      prompt: { as: "value", field: "prompt" },
      aspectRatio: { as: "value", field: "aspect_ratio" },
      quality: { as: "value", field: "quality" },
      outputFormat: { as: "value", field: "output_format" },
      nsfwCheck: { as: "value", field: "nsfw_check" },
      images: { as: "urlArray", field: "image" },
    },
  },
  {
    capability: { module: MINIMAX, name: "minimax-h3" }, result: "video", routes: [{ model: "minimax-h3" }],
    fields: {
      prompt: { as: "value", field: "text" },
      duration: { as: "value", field: "duration" },
      resolution: { as: "value", field: "resolution", whenAbsent: "2K" },
      aspectRatio: { as: "value", field: "ratio" },
      referenceImage: { as: "urlArray", field: "reference_image" },
      referenceVideo: { as: "urlArray", field: "reference_video" },
      referenceAudio: { as: "urlArray", field: "reference_audio" },
      firstFrame: { as: "url", field: "first_frame" },
      lastFrame: { as: "url", field: "last_frame" },
    },
  },
];
