import { artifactDependency } from "@narratage/artifact";
import {
  generationObjectSchema,
  generationPromptSchema,
  portsObjectSchema,
  sealGenerationPortRequest,
  sealGenerationPortTable,
  verifyPortsAgainstTable,
} from "@narratage/generation";
import type {
  GenerationPortTable,
  GenerationPortValue,
  GenerationRequest,
} from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { narrativeDependency } from "@narratage/narrative";
import { assertSpeechDurationIdentity, speechDependency, speechTypes } from "@narratage/speech";
import type { SpeechDuration } from "@narratage/speech";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { Digest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

export const seedanceModuleRef = { name: "@narratage/seedance", version: "0.0.0-dev" } as const;
export const seedanceModels = ["seedance-2", "seedance-2-fast", "seedance-2-mini"] as const;
export type SeedanceModel = typeof seedanceModels[number];

const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"] as const;

/**
 * What Seedance 2 accepts is fixed when the model is trained; no service
 * reselling it can widen or narrow this. Every limit below is stated identically
 * by ByteDance's own launch material, KIE and fal — only the wire field names
 * differ between services, and those live in each Provider's wire mapping.
 *
 * Reference modalities are separate ports because the model gives each its own
 * capacity: 9 images, 3 videos, 3 audio clips, and no more than 12 files in
 * total. Only the resolution ceiling differs between the variants.
 */
function seedancePortTable(model: SeedanceModel): GenerationPortTable {
  return sealGenerationPortTable({
    contract: "svml.generation-ports@1",
    model,
    result: "video",
    ports: [
      { name: "prompt", value: { kind: "text", maxChars: 20_000 }, minItems: 1, maxItems: 1 },
      { name: "referenceImage", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 9 },
      { name: "referenceVideo", value: { kind: "media", accepts: ["video"] }, minItems: 0, maxItems: 3 },
      { name: "referenceAudio", value: { kind: "media", accepts: ["audio"] }, minItems: 0, maxItems: 3 },
      { name: "firstFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      { name: "lastFrame", value: { kind: "media", accepts: ["image"] }, minItems: 0, maxItems: 1 },
      {
        name: "resolution",
        value: {
          kind: "enum",
          values: model === "seedance-2" ? ["480p", "720p", "1080p", "4k"] : ["480p", "720p"],
        },
        minItems: 1,
        maxItems: 1,
      },
      { name: "aspectRatio", value: { kind: "enum", values: [...ASPECT_RATIOS] }, minItems: 1, maxItems: 1 },
      { name: "duration", value: { kind: "number", integer: true, minimum: 4, maximum: 15 }, minItems: 1, maxItems: 1 },
      { name: "generateAudio", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
      { name: "webSearch", value: { kind: "boolean" }, minItems: 1, maxItems: 1 },
    ],
    requires: [
      // First-frame, first-and-last-frame and multimodal reference are three
      // scenarios the model cannot combine.
      { kind: "atMostOneOf", ports: ["referenceImage", "firstFrame"] },
      { kind: "atMostOneOf", ports: ["referenceVideo", "firstFrame"] },
      { kind: "atMostOneOf", ports: ["referenceAudio", "firstFrame"] },
      { kind: "requiresPresent", port: "lastFrame", needs: ["firstFrame"] },
      // Reference audio cannot travel alone; it needs at least one visual reference.
      { kind: "requiresAnyOf", port: "referenceAudio", anyOf: ["referenceImage", "referenceVideo"] },
      { kind: "weightedTotal", weights: { referenceImage: 1, referenceVideo: 1, referenceAudio: 1 }, maximum: 12 },
    ],
  });
}

export const seedancePorts: Readonly<Record<SeedanceModel, GenerationPortTable>> = {
  "seedance-2": seedancePortTable("seedance-2"),
  "seedance-2-fast": seedancePortTable("seedance-2-fast"),
  "seedance-2-mini": seedancePortTable("seedance-2-mini"),
};

export type SeedancePortMap = Readonly<Record<string, readonly GenerationPortValue[]>>;

export function sealSeedanceRequest(model: SeedanceModel, ports: SeedancePortMap): GenerationRequest {
  return sealGenerationPortRequest(seedancePorts[model], ports);
}

export type SeedancePrompt = {
  readonly contract: "svml.seedance-prompt@1";
  readonly text: string;
};

/** One authored generation minus the duration only speech estimation can supply. */
export type SeedanceSpeechProgram = {
  readonly contract: "svml.seedance-speech-spine@1";
  readonly model: SeedanceModel;
  readonly ports: SeedancePortMap;
};

export const seedanceTypes = {
  prompt: { module: seedanceModuleRef, name: "Prompt" },
  speechSpine: { module: seedanceModuleRef, name: "SpeechProgram" },
} satisfies Record<string, TypeRef>;

export const seedanceSpeechCompileProducers = Object.fromEntries(
  seedanceModels.map((model) => [model, {
    module: seedanceModuleRef,
    name: `compile-${model}-speech-request`,
  }]),
) as Record<SeedanceModel, ProducerRef>;

export const seedanceSpeechCompileImplementationDigests = Object.fromEntries(
  seedanceModels.map((model) => [model, digestOf(`@narratage/seedance/compile-${model}-speech-request@1`)]),
) as Record<SeedanceModel, Digest>;

export const seedanceSurfaceImplementationDigests = {
  prompt: digestOf("@narratage/seedance/prompt-surface@1"),
  speech: digestOf("@narratage/seedance/speech-surface@4"),
  video: digestOf("@narratage/seedance/video-surface@2"),
} as const;

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Seedance value must be an object");
  }
}

export function sealSeedancePrompt(text: string): SeedancePrompt {
  const normalized = text.trim();
  if (normalized.length === 0 || normalized.length > 20_000) {
    throw new Error("Seedance Prompt must contain 1 to 20,000 characters");
  }
  return { contract: "svml.seedance-prompt@1" as const, text: normalized };
}

export function verifySeedancePrompt(value: unknown): asserts value is SeedancePrompt {
  assertObject(value);
  if (value.contract !== "svml.seedance-prompt@1" || typeof value.text !== "string" || value.text.length === 0) {
    throw new Error("Seedance Prompt is invalid");
  }
}

export function verifySeedanceSpeechProgram(value: unknown): asserts value is SeedanceSpeechProgram {
  assertObject(value);
  if (value.contract !== "svml.seedance-speech-spine@1"
    || !seedanceModels.includes(value.model as SeedanceModel)) {
    throw new Error("Seedance SpeechProgram identity is invalid");
  }
  const table = seedancePorts[value.model as SeedanceModel];
  verifyPortsAgainstTable(table, value.ports, { omit: ["duration"] });
  const generateAudio = (value.ports as SeedancePortMap).generateAudio;
  if (generateAudio?.[0] !== true) throw new Error("Seedance SpeechProgram must generate audio");
}

export function sealSeedanceSpeechProgram(value: SeedanceSpeechProgram): SeedanceSpeechProgram {
  const result = canonicalize(value) as unknown as SeedanceSpeechProgram;
  verifySeedanceSpeechProgram(result);
  return result;
}

export function compileSeedanceSpeechRequest(
  program: SeedanceSpeechProgram,
  duration: SpeechDuration,
): GenerationRequest {
  verifySeedanceSpeechProgram(program);
  assertSpeechDurationIdentity(duration);
  return sealSeedanceRequest(program.model, { ...program.ports, duration: [duration.durationSec] });
}

const speechSpineSchema = (model: SeedanceModel): ValueSchema => generationObjectSchema({
  contract: { schema: { kind: "literal", value: "svml.seedance-speech-spine@1" } },
  model: { schema: { kind: "literal", value: model } },
  ports: { schema: portsObjectSchema(seedancePorts[model], { omit: ["duration"] }) },
});

const seedanceBaseDefinition = defineExactModelModule({
  module: seedanceModuleRef,
  endpoints: ([
    ["standard", "seedance-2"],
    ["fast", "seedance-2-fast"],
    ["mini", "seedance-2-mini"],
  ] as const).map(([key, model]) => ({
    key,
    requestTypeName: `${model.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("")}Request`,
    producerName: `request-${model}`,
    ports: seedancePorts[model],
  })),
});

export const seedanceEndpoints = seedanceBaseDefinition.endpoints;
export const seedanceEndpointsByModel = {
  "seedance-2": seedanceEndpoints.standard!,
  "seedance-2-fast": seedanceEndpoints.fast!,
  "seedance-2-mini": seedanceEndpoints.mini!,
} as const;

export const seedanceManifest = {
  ...seedanceBaseDefinition.manifest,
  dependencies: [
    ...seedanceBaseDefinition.manifest.dependencies,
    artifactDependency,
    narrativeDependency,
    speechDependency,
  ],
  types: [
    ...seedanceBaseDefinition.manifest.types,
    {
      name: seedanceTypes.speechSpine.name,
      schema: { kind: "oneOf", variants: seedanceModels.map(speechSpineSchema) } satisfies ValueSchema,
    },
    {
      name: seedanceTypes.prompt.name,
      schema: generationObjectSchema({
        contract: { schema: { kind: "literal", value: "svml.seedance-prompt@1" } },
        text: { schema: generationPromptSchema },
      }),
    },
  ],
  surfaces: [
    {
      name: "prompt",
      tag: "Prompt",
      mode: "structured",
      outputs: [seedanceTypes.prompt],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@narratage/seedance/prompt-surface",
        digest: seedanceSurfaceImplementationDigests.prompt,
      },
    },
    {
      name: "speech",
      tag: "Speech",
      mode: "structured",
      outputs: [seedanceTypes.speechSpine, ...Object.values(seedanceEndpoints).map((endpoint) => endpoint.requestType)],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@narratage/seedance/speech-surface",
        digest: seedanceSurfaceImplementationDigests.speech,
      },
    },
    {
      name: "video",
      tag: "Video",
      mode: "structured",
      outputs: Object.values(seedanceEndpoints).map((endpoint) => endpoint.requestType),
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@narratage/seedance/video-surface",
        digest: seedanceSurfaceImplementationDigests.video,
      },
    },
  ],
  producers: [
    ...seedanceBaseDefinition.manifest.producers,
    ...seedanceModels.map((model) => ({
      name: seedanceSpeechCompileProducers[model].name,
      inputs: [
        { name: "program", type: seedanceTypes.speechSpine },
        { name: "duration", type: speechTypes.duration },
      ],
      outputs: [{ name: "request", type: seedanceEndpointsByModel[model].requestType }],
      needs: [],
      implementation: {
        kind: "registered" as const,
        locator: `@narratage/seedance/compile-${model}-speech-request`,
        digest: seedanceSpeechCompileImplementationDigests[model],
      },
    })),
  ],
} as const;
export const seedanceManifestDigest = digestOf(seedanceManifest);
export const seedanceComponent = {
  ...seedanceBaseDefinition.component,
  producers: [
    ...seedanceBaseDefinition.component.producers,
    ...seedanceModels.map((model) => ({
      producer: seedanceSpeechCompileProducers[model],
      implementationDigest: seedanceSpeechCompileImplementationDigests[model],
      handler: ({ inputs }: { readonly inputs: Readonly<Record<string, { readonly value: import("@narratage/protocol").StoredValue }>> }) => ({
        outputs: {
          request: {
            kind: "inline" as const,
            value: canonicalize(compileSeedanceSpeechRequest(
              inputs.program?.value.kind === "inline"
                ? inputs.program.value.value as unknown as SeedanceSpeechProgram
                : (() => { throw new Error("Seedance SpeechProgram must be inline"); })(),
              inputs.duration?.value.kind === "inline"
                ? inputs.duration.value.value as unknown as SpeechDuration
                : (() => { throw new Error("SpeechDuration must be inline"); })(),
            )),
          },
        },
        needs: {},
      }),
    })),
  ],
};
export const seedanceDefinition = {
  ...seedanceBaseDefinition,
  manifest: seedanceManifest,
  manifestDigest: seedanceManifestDigest,
};

export {
  createSeedanceGenerationFragment,
  createSeedanceSpeechGenerationFragment,
} from "./fragment.js";
export {
  decodeSeedancePromptSurface,
  decodeSeedanceSpeechSurface,
  decodeSeedanceVideoSurface,
} from "./surface.js";
