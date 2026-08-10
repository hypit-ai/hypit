import {
  generationObjectSchema,
  portsObjectSchema,
  sealGenerationPortRequest,
  sealGenerationRequestDraft,
  sealGenerationPortTable,
  verifyPortsAgainstTable,
} from "@narratage/generation";
import type {
  GenerationPortTable,
  GenerationPortValue,
  GenerationRequest,
  GenerationRequestDraft,
} from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import { assertSpeechDurationIdentity, speechDependency, speechTypes } from "@narratage/speech";
import type { SpeechDuration } from "@narratage/speech";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { Digest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

export const seedanceModuleRef = { name: "@narratage/seedance", version: "1" } as const;
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

/** One authored generation minus a duration supplied by an explicit graph edge. */
export type SeedanceDurationProgram = {
  readonly contract: "svml.seedance-duration-program@1";
  readonly model: SeedanceModel;
  readonly ports: SeedancePortMap;
};

export const seedanceTypes = {
  durationProgram: { module: seedanceModuleRef, name: "DurationProgram" },
} satisfies Record<string, TypeRef>;

export const seedanceDurationCompileProducers = Object.fromEntries(
  seedanceModels.map((model) => [model, {
    module: seedanceModuleRef,
    name: `compile-${model}-duration-request`,
  }]),
) as Record<SeedanceModel, ProducerRef>;

export const seedanceDurationCompileImplementationDigests = Object.fromEntries(
  seedanceModels.map((model) => [model, digestOf(`@narratage/seedance/compile-${model}-duration-request@1`)]),
) as Record<SeedanceModel, Digest>;

export const seedanceSurfaceImplementationDigests = {
  textVideo: digestOf("@narratage/seedance/text-video-surface@1"),
  frameVideo: digestOf("@narratage/seedance/frame-video-surface@1"),
  referenceVideo: digestOf("@narratage/seedance/reference-video-surface@1"),
} as const;

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Seedance value must be an object");
  }
}

export function verifySeedanceDurationProgram(value: unknown): asserts value is SeedanceDurationProgram {
  assertObject(value);
  if (value.contract !== "svml.seedance-duration-program@1"
    || !seedanceModels.includes(value.model as SeedanceModel)) {
    throw new Error("Seedance DurationProgram identity is invalid");
  }
  const table = seedancePorts[value.model as SeedanceModel];
  const later = table.ports
    .filter((port) => port.value.kind === "media" || port.value.kind === "text")
    .map((port) => port.name);
  verifyPortsAgainstTable(table, value.ports, { omit: ["duration", ...later] });
  const generateAudio = (value.ports as SeedancePortMap).generateAudio;
}

export function sealSeedanceDurationProgram(value: SeedanceDurationProgram): SeedanceDurationProgram {
  const result = canonicalize(value) as unknown as SeedanceDurationProgram;
  verifySeedanceDurationProgram(result);
  return result;
}

export function compileSeedanceDurationRequestDraft(
  program: SeedanceDurationProgram,
  duration: SpeechDuration,
): GenerationRequestDraft {
  verifySeedanceDurationProgram(program);
  assertSpeechDurationIdentity(duration);
  return sealGenerationRequestDraft(seedancePorts[program.model], {
    ...program.ports,
    duration: [duration.durationSec],
  });
}

const durationProgramSchema = (model: SeedanceModel): ValueSchema => generationObjectSchema({
  contract: { schema: { kind: "literal", value: "svml.seedance-duration-program@1" } },
  model: { schema: { kind: "literal", value: model } },
  ports: {
    schema: portsObjectSchema(seedancePorts[model], {
      omit: [
        "duration",
        ...seedancePorts[model].ports
          .filter((port) => port.value.kind === "media" || port.value.kind === "text")
          .map((port) => port.name),
      ],
    }),
  },
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
    speechDependency,
  ],
  types: [
    ...seedanceBaseDefinition.manifest.types,
    {
      name: seedanceTypes.durationProgram.name,
      schema: { kind: "oneOf", variants: seedanceModels.map(durationProgramSchema) } satisfies ValueSchema,
    },
  ],
  surfaces: [
    {
      name: "text-video",
      tag: "TextVideo",
      mode: "structured",
      outputs: [
        seedanceTypes.durationProgram,
        ...Object.values(seedanceEndpoints).flatMap((endpoint) => [
          endpoint.draftType,
          ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
        ]),
      ],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@narratage/seedance/text-video-surface",
        digest: seedanceSurfaceImplementationDigests.textVideo,
      },
    },
    {
      name: "frame-video",
      tag: "FrameVideo",
      mode: "structured",
      outputs: [seedanceTypes.durationProgram, ...Object.values(seedanceEndpoints).flatMap((endpoint) => [
        endpoint.draftType, ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
      ])],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@narratage/seedance/frame-video-surface",
        digest: seedanceSurfaceImplementationDigests.frameVideo,
      },
    },
    {
      name: "reference-video",
      tag: "ReferenceVideo",
      mode: "structured",
      outputs: [seedanceTypes.durationProgram, ...Object.values(seedanceEndpoints).flatMap((endpoint) => [
        endpoint.draftType, ...Object.values(endpoint.mediaBindings).map((binding) => binding.type),
      ])],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@narratage/seedance/reference-video-surface",
        digest: seedanceSurfaceImplementationDigests.referenceVideo,
      },
    },
  ],
  producers: [
    ...seedanceBaseDefinition.manifest.producers,
    ...seedanceModels.map((model) => ({
      name: seedanceDurationCompileProducers[model].name,
      inputs: [
        { name: "program", type: seedanceTypes.durationProgram },
        { name: "duration", type: speechTypes.duration },
      ],
      outputs: [{ name: "draft", type: seedanceEndpointsByModel[model].draftType }],
      needs: [],
      implementation: {
        kind: "registered" as const,
        locator: `@narratage/seedance/compile-${model}-duration-request`,
        digest: seedanceDurationCompileImplementationDigests[model],
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
      producer: seedanceDurationCompileProducers[model],
      implementationDigest: seedanceDurationCompileImplementationDigests[model],
      handler: ({ inputs }: { readonly inputs: Readonly<Record<string, { readonly value: import("@narratage/protocol").StoredValue }>> }) => ({
        outputs: {
          draft: {
            kind: "inline" as const,
            value: canonicalize(compileSeedanceDurationRequestDraft(
              inputs.program?.value.kind === "inline"
                ? inputs.program.value.value as unknown as SeedanceDurationProgram
                : (() => { throw new Error("Seedance DurationProgram must be inline"); })(),
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
  createSeedanceAssembledGenerationFragment,
  createSeedanceGenerationFragment,
  createSeedanceDurationGenerationFragment,
} from "./fragment.js";
export {
  decodeSeedanceFrameVideoSurface,
  decodeSeedanceReferenceVideoSurface,
  decodeSeedanceTextVideoSurface,
} from "./surface.js";
