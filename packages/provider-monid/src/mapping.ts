import type { ModuleRef } from "@hypit/protocol";
import type { GenerationWireMapping } from "@hypit/generation";

const SEEDANCE: ModuleRef = { name: "@hypit/seedance", version: "1" };

/**
 * Monid `bytedance` endpoints and the fields their ModelArk request body takes. Media fields name
 * the `role` of a `content` item; routes.ts folds them into that array. `personReference` is
 * accepted on visual references and not transmitted: the endpoint has no field for it.
 */
const seedance = (name: string, endpoint: string): GenerationWireMapping => ({
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

export const monidMappings: readonly GenerationWireMapping[] = [
  seedance("seedance-2", "/v1/video/seedance-2.0"),
  seedance("seedance-2-fast", "/v1/video/seedance-2.0-fast"),
  seedance("seedance-2-mini", "/v1/video/seedance-2.0-mini"),
  seedance("seedance-2.5", "/v1/video/seedance-2.5"),
];
