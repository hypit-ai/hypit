import { sealModelFieldRequest, defineModelFields } from "@hypit/generation/model-fields";
import type {
  ModelField,
  ModelFieldRequirement,
  ModelFieldTable,
  ModelFieldValue,
  ModelFieldRequest,
} from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";

import { pixverseRequestValidator } from "./validation.js";

export const pixverseModuleRef = { name: "@hypit/pixverse", version: "1" } as const;
export const pixverseModels = ["pixverse-v6", "pixverse-c1"] as const;
export type PixverseModel = typeof pixverseModels[number];

const PIXVERSE_QUALITIES = ["540p", "720p"] as const;
const PIXVERSE_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"] as const;
/** V6 reads `auto` as the shape of the reference videos it generates from. */
const PIXVERSE_V6_ASPECT_RATIOS = [...PIXVERSE_ASPECT_RATIOS, "auto"] as const;

/**
 * Exact PixVerse model inputs. V6 takes up to ten reference images and up to two reference videos,
 * and carries the sampling seed and multi-clip switch its endpoints declare. C1 takes up to seven
 * reference images and generates from a prompt, a frame or a pair of frames.
 */
function pixverseFieldTable(model: PixverseModel): ModelFieldTable {
  const v6 = model === "pixverse-v6";
  const referenceVideo: readonly ModelField[] = v6
    ? [{ name: "referenceVideo", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 2 }]
    : [];
  const v6Switches: readonly ModelField[] = v6
    ? [
        { name: "multiClip", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
        { name: "seed", value: { kind: "number", integer: true, minimum: 0, maximum: 2_147_483_647 }, minItems: 0, maxItems: 1 },
      ]
    : [];
  const v6Requires: readonly ModelFieldRequirement[] = v6
    ? [
        // A run that bridges two frames, and one that carries subject references, is a single
        // continuous shot rather than several cuts.
        { kind: "atMostOneOf", fields: ["multiClip", "lastFrame"] },
        { kind: "atMostOneOf", fields: ["multiClip", "referenceImage"] },
        // The reference videos carry the length of the generated run.
        { kind: "atMostOneOf", fields: ["duration", "referenceVideo"] },
      ]
    : [];
  return defineModelFields({
    model,
    fields: [
      { name: "prompt", value: { kind: "text", maxChars: 5_000 }, minItems: 1, maxItems: 1 },
      { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: v6 ? 10 : 7 },
      ...referenceVideo,
      // Required except in the reference-video mode, which pixverseRequestValidator states.
      { name: "duration", value: { kind: "number", integer: true, minimum: 1, maximum: 15 }, minItems: 0, maxItems: 1 },
      { name: "quality", value: { kind: "enum", values: [...PIXVERSE_QUALITIES] }, minItems: 1, maxItems: 1 },
      {
        name: "aspectRatio",
        value: { kind: "enum", values: v6 ? [...PIXVERSE_V6_ASPECT_RATIOS] : [...PIXVERSE_ASPECT_RATIOS] },
        minItems: 0,
        maxItems: 1,
      },
      { name: "generateAudio", value: { kind: "boolean" }, minItems: 0, maxItems: 1 },
      ...v6Switches,
    ],
    requires: [
      // A last frame states where a run that already has a first frame ends.
      { kind: "requiresPresent", field: "lastFrame", needs: ["firstFrame"] },
      // A run that starts from a frame inherits that frame's shape.
      { kind: "atMostOneOf", fields: ["aspectRatio", "firstFrame"] },
      // Frames and subject references are separate ways of placing an image in the run.
      { kind: "atMostOneOf", fields: ["referenceImage", "firstFrame"] },
      ...v6Requires,
    ],
  });
}

export const pixverseFields: Readonly<Record<PixverseModel, ModelFieldTable>> = {
  "pixverse-v6": pixverseFieldTable("pixverse-v6"),
  "pixverse-c1": pixverseFieldTable("pixverse-c1"),
};

export function sealPixverseRequest(
  model: PixverseModel,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  return sealModelFieldRequest(pixverseFields[model], fields);
}

const pixverseBaseDefinition = defineFieldModelModule({
  module: pixverseModuleRef,
  endpoints: ([["v6", "pixverse-v6"], ["c1", "pixverse-c1"]] as const).map(([key, model]) => ({
    key,
    requestTypeName: model === "pixverse-v6" ? "PixverseV6Request" : "PixverseC1Request",
    producerName: `request-${model}`,
    fields: pixverseFields[model],
    result: standardGenerationResults.video,
    validateRequest: pixverseRequestValidator(model),
  })),
});

export const pixverseEndpoints = pixverseBaseDefinition.endpoints;
export const pixverseEndpointsByModel = {
  "pixverse-v6": pixverseEndpoints.v6!,
  "pixverse-c1": pixverseEndpoints.c1!,
} as const;
export const pixverseComponent = pixverseBaseDefinition.component;

export const pixverseManifest = {
  ...pixverseBaseDefinition.manifest,
};
export const pixverseDefinition = {
  ...pixverseBaseDefinition,
  manifest: pixverseManifest,
};
