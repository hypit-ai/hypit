import { defineModelFields } from "@hypit/generation/model-fields";
import type {
  ModelFieldTable,
  ModelFieldValue,
  ModelFieldRequest,
} from "@hypit/generation/model-fields";
import { defineFieldModelModule, standardGenerationResults } from "@hypit/generation/model-fields";
import { validateSeedanceInputs } from "./validation.js";

export const seedanceModuleRef = { name: "@hypit/seedance", version: "1" } as const;
export const seedanceModels = ["seedance-2", "seedance-2-fast", "seedance-2-mini", "seedance-2.5"] as const;
export type SeedanceModel = typeof seedanceModels[number];

const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"] as const;

const PERSON_REFERENCE_FIELDS = [{ name: "personReference", value: { kind: "boolean" } }] as const;

const SEEDANCE_25_DURATIONS = [-1, ...Array.from({ length: 27 }, (_item, index) => index + 4)] as const;

/**
 * Exact Seedance model inputs. Provider wire names are deliberately absent:
 * Each service maps these fields independently.
 *
 * Seedance 2.5 is not treated as an alias for a Seedance 2 variant. Its public
 * request definition widens prompt/reference capacities and duration independently,
 * so it receives its own exact Capability while reusing the same three author
 * declarations.
 */
function seedanceFieldTable(model: SeedanceModel): ModelFieldTable {
  const is25 = model === "seedance-2.5";
  return defineModelFields({
    model,
    fields: [
      { name: "prompt", value: { kind: "text", maxChars: is25 ? 30_000 : 20_000 }, minItems: 1, maxItems: 1 },
      { name: "referenceImage", value: { kind: "media", accepts: ["image"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0 },
      { name: "referenceVideo", value: { kind: "media", accepts: ["video"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0 },
      { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0 },
      { name: "firstFrame", value: { kind: "media", accepts: ["image"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0, maxItems: 1 },
      { name: "lastFrame", value: { kind: "media", accepts: ["image"], itemFields: PERSON_REFERENCE_FIELDS }, minItems: 0, maxItems: 1 },
      {
        name: "resolution",
        value: {
          kind: "enum",
          values: model === "seedance-2"
            ? ["480p", "720p", "1080p", "4k"]
            : is25 ? ["480p", "720p", "1080p"] : ["480p", "720p"],
        },
        minItems: 1,
        maxItems: 1,
      },
      { name: "aspectRatio", value: { kind: "enum", values: [...ASPECT_RATIOS] }, minItems: 1, maxItems: 1 },
      {
        name: "duration",
        value: is25
          ? { kind: "enum", values: [...SEEDANCE_25_DURATIONS] }
          : { kind: "number", integer: true, minimum: 4, maximum: 15 },
        minItems: 1,
        maxItems: 1,
      },
      { name: "generateAudio", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
      { name: "webSearch", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
    ],
    requires: [
      // First-frame, first-and-last-frame and multimodal reference are three
      // scenarios the model cannot combine.
      { kind: "atMostOneOf", fields: ["referenceImage", "firstFrame"] },
      { kind: "atMostOneOf", fields: ["referenceVideo", "firstFrame"] },
      { kind: "atMostOneOf", fields: ["referenceAudio", "firstFrame"] },
      { kind: "requiresPresent", field: "lastFrame", needs: ["firstFrame"] },
      ...(is25 ? [] : [
        // Seedance 2 reference audio cannot travel alone; it needs a visual reference.
        { kind: "requiresAnyOf" as const, field: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
      ]),
    ],
  });
}

export const seedanceFields: Readonly<Record<SeedanceModel, ModelFieldTable>> = {
  "seedance-2": seedanceFieldTable("seedance-2"),
  "seedance-2-fast": seedanceFieldTable("seedance-2-fast"),
  "seedance-2-mini": seedanceFieldTable("seedance-2-mini"),
  "seedance-2.5": seedanceFieldTable("seedance-2.5"),
};

export type SeedanceFieldValues = Readonly<Record<string, readonly ModelFieldValue[]>>;

export function sealSeedanceRequest(model: SeedanceModel, fields: SeedanceFieldValues): ModelFieldRequest {
  return seedanceEndpointsByModel[model].sealRequest(fields);
}

const seedanceBaseDefinition = defineFieldModelModule({
  module: seedanceModuleRef,
  endpoints: ([
    ["standard", "seedance-2"],
    ["fast", "seedance-2-fast"],
    ["mini", "seedance-2-mini"],
    ["v25", "seedance-2.5"],
  ] as const).map(([key, model]) => ({
    key,
    requestTypeName: model === "seedance-2.5"
      ? "Seedance25Request"
      : `${model.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("")}Request`,
    producerName: `request-${model}`,
    fields: seedanceFields[model],
    result: standardGenerationResults.video,
    validateInputs: validateSeedanceInputs,
  })),
});

export const seedanceEndpoints = seedanceBaseDefinition.endpoints;
export const seedanceEndpointsByModel = {
  "seedance-2": seedanceEndpoints.standard!,
  "seedance-2-fast": seedanceEndpoints.fast!,
  "seedance-2-mini": seedanceEndpoints.mini!,
  "seedance-2.5": seedanceEndpoints.v25!,
} as const;

/** The duration is an author literal on every Seedance declaration, so the manifest is the exact-model module's own. */
export const seedanceManifest = seedanceBaseDefinition.manifest;

export const seedanceComponent = seedanceBaseDefinition.component;
export const seedanceDefinition = seedanceBaseDefinition;

export {
  createSeedanceAssembledGenerationFragment,
  createSeedanceGenerationFragment,
} from "./fragment.js";
