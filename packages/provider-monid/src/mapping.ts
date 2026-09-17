import type { ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };
const MINIMAX_H3: ModuleRef = { name: "@hypit/minimax-h3", version: "1" };

/**
 * One mapping plus the Monid provider that relays the endpoint. Monid addresses an endpoint by
 * provider and path, so the provider travels with the mapping rather than being assumed.
 */
export type MonidMapping = GenerationWireMapping & { readonly service: string };

/**
 * Monid `bytedance` endpoints and the fields their ModelArk request body takes. Media fields name
 * the `role` of a `content` item; routes.ts folds them into that array. `personReference` is
 * accepted on visual references and not transmitted: the endpoint has no field for it.
 */
const seedance = (name: string, endpoint: string): MonidMapping => ({
  service: "bytedance",
  capability: { module: SEEDANCE, name }, result: "video", routes: [{ model: endpoint }],
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

/**
 * Monid's `minimax` MiniMax-H3 endpoint. It takes the same role-tagged `content` array as the
 * ModelArk endpoints above, names the model in the body, and carries neither a generated-audio nor
 * a web-search field. `resolution` is required by the endpoint while the model's port is optional,
 * so an unstated resolution is sent as the 2K the HypiHub Provider also selects.
 */
const minimaxH3: MonidMapping = {
  service: "minimax",
  capability: { module: MINIMAX_H3, name: "minimax-h3" }, result: "video",
  routes: [{ model: "/v1/video/minimax-h3" }],
  constants: { model: "MiniMax-H3" },
  fields: {
    prompt: { as: "value", field: "text" },
    referenceImage: { as: "urlArray", field: "reference_image" },
    referenceVideo: { as: "urlArray", field: "reference_video" },
    referenceAudio: { as: "urlArray", field: "reference_audio" },
    firstFrame: { as: "url", field: "first_frame" },
    lastFrame: { as: "url", field: "last_frame" },
    resolution: { as: "value", field: "resolution", whenAbsent: "2K" },
    aspectRatio: { as: "value", field: "ratio" },
    duration: { as: "value", field: "duration" },
  },
};

export const monidMappings: readonly MonidMapping[] = [
  seedance("seedance-2", "/v1/video/seedance-2.0"),
  seedance("seedance-2-fast", "/v1/video/seedance-2.0-fast"),
  seedance("seedance-2-mini", "/v1/video/seedance-2.0-mini"),
  seedance("seedance-2.5", "/v1/video/seedance-2.5"),
  minimaxH3,
];
