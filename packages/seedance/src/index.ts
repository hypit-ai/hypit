import { artifactDependency } from "@svml/artifact";
import {
  assertGenerationBlobRef,
  generationBlobRefSchema,
  generationObjectSchema,
  generationPromptSchema,
  sealGenerationRequest,
} from "@svml/generation";
import { defineExactModelModule } from "@svml/model-kit";
import {
  assertSpeechDurationIdentity,
  contractTypes,
  videoContractDependencies,
} from "@svml/contracts";
import type { SpeechDuration } from "@svml/contracts";
import { canonicalize, digestOf } from "@svml/protocol";
import type { BlobRef, Digest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

export const seedanceModuleRef = { name: "@svml/seedance", version: "0.0.0-dev" } as const;
export const seedanceModels = ["seedance-2", "seedance-2-fast", "seedance-2-mini"] as const;
export type SeedanceModel = typeof seedanceModels[number];

export type SeedanceReference =
  | { readonly kind: "image"; readonly artifact: BlobRef }
  | { readonly kind: "video"; readonly artifact: BlobRef }
  | { readonly kind: "audio"; readonly artifact: BlobRef };

export type SeedanceMode =
  | { readonly kind: "text" }
  | { readonly kind: "frames"; readonly firstFrame: BlobRef; readonly lastFrame?: BlobRef }
  | { readonly kind: "reference"; readonly items: readonly SeedanceReference[] };

export type SeedanceRequestContent<M extends SeedanceModel = SeedanceModel> = {
  readonly contract: "svml.seedance-request@1";
  readonly model: M;
  readonly prompt: string;
  readonly mode: SeedanceMode;
  readonly resolution: "480p" | "720p" | "1080p";
  readonly aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" | "adaptive";
  readonly durationSec: number;
  readonly generateAudio: boolean;
  readonly webSearch: boolean;
};

export type SeedanceRequest<M extends SeedanceModel = SeedanceModel> = SeedanceRequestContent<M>;

export type SeedancePrompt = {
  readonly contract: "svml.seedance-prompt@1";
  readonly text: string;
};

export type SeedanceSpeechProgram = {
  readonly contract: "svml.seedance-speech-program@1";
  readonly model: SeedanceModel;
  readonly prompt: string;
  readonly mode: SeedanceMode;
  readonly resolution: "480p" | "720p" | "1080p";
  readonly aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9" | "adaptive";
  readonly generateAudio: true;
  readonly webSearch: boolean;
};

export const seedanceTypes = {
  prompt: { module: seedanceModuleRef, name: "Prompt" },
  speechProgram: { module: seedanceModuleRef, name: "SpeechProgram" },
} satisfies Record<string, TypeRef>;

export const seedanceSpeechCompileProducers = Object.fromEntries(
  seedanceModels.map((model) => [model, {
    module: seedanceModuleRef,
    name: `compile-${model}-speech-request`,
  }]),
) as Record<SeedanceModel, ProducerRef>;

export const seedanceSpeechCompileImplementationDigests = Object.fromEntries(
  seedanceModels.map((model) => [model, digestOf(`@svml/seedance/compile-${model}-speech-request@1`)]),
) as Record<SeedanceModel, Digest>;

export const seedanceSurfaceImplementationDigests = {
  prompt: digestOf("@svml/seedance/prompt-surface@1"),
  speech: digestOf("@svml/seedance/speech-surface@3"),
  video: digestOf("@svml/seedance/video-surface@1"),
} as const;

export function sealSeedancePrompt(text: string): SeedancePrompt {
  const normalized = text.trim();
  if (normalized.length === 0 || normalized.length > 20_000) {
    throw new Error("Seedance Prompt must contain 1 to 20,000 characters");
  }
  const content = { contract: "svml.seedance-prompt@1" as const, text: normalized };
  return content;
}

export function verifySeedancePrompt(value: unknown): asserts value is SeedancePrompt {
  assertObject(value);
  if (value.contract !== "svml.seedance-prompt@1" || typeof value.text !== "string" || value.text.length === 0) {
    throw new Error("Seedance Prompt is invalid");
  }
}

export function sealSeedanceSpeechProgram(value: SeedanceSpeechProgram): SeedanceSpeechProgram {
  const result = structuredClone(value);
  verifySeedanceSpeechProgram(result);
  return result;
}

export function verifySeedanceSpeechProgram(value: unknown): asserts value is SeedanceSpeechProgram {
  assertObject(value);
  if (
    value.contract !== "svml.seedance-speech-program@1"
    || !seedanceModels.includes(value.model as SeedanceModel)
    || typeof value.prompt !== "string"
    || value.prompt.trim().length === 0
    || value.generateAudio !== true
    || typeof value.webSearch !== "boolean"
    || !["480p", "720p", "1080p"].includes(value.resolution as string)
    || !["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"].includes(value.aspectRatio as string)
  ) {
    throw new Error("Seedance SpeechProgram is invalid");
  }
  const program = value as unknown as SeedanceSpeechProgram;
  sealSeedanceRequest({
    contract: "svml.seedance-request@1",
    model: program.model,
    prompt: program.prompt,
    mode: program.mode,
    resolution: program.resolution,
    aspectRatio: program.aspectRatio,
    durationSec: 4,
    generateAudio: true,
    webSearch: program.webSearch,
  });
}

export function compileSeedanceSpeechRequest(
  program: SeedanceSpeechProgram,
  duration: SpeechDuration,
): SeedanceRequest {
  verifySeedanceSpeechProgram(program);
  assertSpeechDurationIdentity(duration);
  if (!Number.isSafeInteger(duration.durationSec) || duration.durationSec < 4 || duration.durationSec > 15) {
    throw new Error("Seedance Speech duration must be an integer between 4 and 15 seconds");
  }
  return sealSeedanceRequest({
    contract: "svml.seedance-request@1",
    model: program.model,
    prompt: program.prompt,
    mode: program.mode,
    resolution: program.resolution,
    aspectRatio: program.aspectRatio,
    durationSec: duration.durationSec,
    generateAudio: true,
    webSearch: program.webSearch,
  });
}

const referenceSchema: ValueSchema = {
  kind: "oneOf",
  variants: (["image", "video", "audio"] as const).map((kind) => generationObjectSchema({
    kind: { schema: { kind: "literal", value: kind } },
    artifact: { schema: generationBlobRefSchema },
  })),
};

const modeSchema: ValueSchema = {
  kind: "oneOf",
  variants: [
    generationObjectSchema({ kind: { schema: { kind: "literal", value: "text" } } }),
    generationObjectSchema({
      kind: { schema: { kind: "literal", value: "frames" } },
      firstFrame: { schema: generationBlobRefSchema },
      lastFrame: { schema: generationBlobRefSchema, optional: true },
    }),
    generationObjectSchema({
      kind: { schema: { kind: "literal", value: "reference" } },
      items: { schema: { kind: "array", minItems: 1, maxItems: 12, items: referenceSchema } },
    }),
  ],
};

const aspectRatioSchema = {
  kind: "string",
  enum: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"],
} as const satisfies ValueSchema;

const speechProgramSchema: ValueSchema = generationObjectSchema({
  contract: { schema: { kind: "literal", value: "svml.seedance-speech-program@1" } },
  model: { schema: { kind: "string", enum: [...seedanceModels] } },
  prompt: { schema: generationPromptSchema },
  mode: { schema: modeSchema },
  resolution: { schema: { kind: "string", enum: ["480p", "720p", "1080p"] } },
  aspectRatio: { schema: aspectRatioSchema },
  generateAudio: { schema: { kind: "literal", value: true } },
  webSearch: { schema: { kind: "boolean" } },
});

function requestSchema(model: SeedanceModel): ValueSchema {
  return generationObjectSchema({
    contract: { schema: { kind: "literal", value: "svml.seedance-request@1" } },
    model: { schema: { kind: "literal", value: model } },
    prompt: { schema: generationPromptSchema },
    mode: { schema: modeSchema },
    resolution: {
      schema: {
        kind: "string",
        enum: model === "seedance-2" ? ["480p", "720p", "1080p"] : ["480p", "720p"],
      },
    },
    aspectRatio: { schema: aspectRatioSchema },
    durationSec: { schema: { kind: "number", integer: true, minimum: 4, maximum: 15 } },
    generateAudio: { schema: { kind: "boolean" } },
    webSearch: { schema: { kind: "boolean" } },
  });
}

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Seedance request must be an object");
  }
}

export function verifySeedanceRequest(value: unknown, expectedModel?: SeedanceModel): asserts value is SeedanceRequest {
  assertObject(value);
  if (value.contract !== "svml.seedance-request@1") throw new Error("Seedance request contract is invalid");
  if (!seedanceModels.includes(value.model as SeedanceModel)) throw new Error("Seedance model is invalid");
  if (expectedModel !== undefined && value.model !== expectedModel) throw new Error(`Expected ${expectedModel}`);
  const mode = value.mode;
  assertObject(mode);
  if (mode.kind === "frames") {
    assertGenerationBlobRef(mode.firstFrame, "image/");
    if (mode.lastFrame !== undefined) assertGenerationBlobRef(mode.lastFrame, "image/");
  } else if (mode.kind === "reference") {
    if (!Array.isArray(mode.items) || mode.items.length === 0) throw new Error("Seedance references are empty");
    for (const item of mode.items) {
      assertObject(item);
      if (item.kind !== "image" && item.kind !== "video" && item.kind !== "audio") {
        throw new Error("Seedance reference kind is invalid");
      }
      assertGenerationBlobRef(item.artifact, `${item.kind}/` as "image/" | "video/" | "audio/");
    }
  } else if (mode.kind !== "text") {
    throw new Error("Seedance mode is invalid");
  }
}

export function sealSeedanceRequest<M extends SeedanceModel>(
  content: SeedanceRequestContent<M>,
): SeedanceRequest<M> {
  const request = sealGenerationRequest(content);
  verifySeedanceRequest(request, content.model);
  return request;
}

const seedanceBaseDefinition = defineExactModelModule({
  module: seedanceModuleRef,
  endpoints: [
    ["standard", "seedance-2"],
    ["fast", "seedance-2-fast"],
    ["mini", "seedance-2-mini"],
  ].map(([key, model]) => ({
    key: key!,
    requestTypeName: `${model!.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join("")}Request`,
    capabilityName: `${model}-generation`,
    producerName: `request-${model}`,
    result: "video" as const,
    requestSchema: requestSchema(model as SeedanceModel),
    verifyRequest: (value: unknown) => verifySeedanceRequest(value, model as SeedanceModel),
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
    videoContractDependencies.narrative,
    videoContractDependencies.speech,
  ],
  types: [
    ...seedanceBaseDefinition.manifest.types,
    { name: seedanceTypes.speechProgram.name, schema: speechProgramSchema },
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
        locator: "@svml/seedance/prompt-surface",
        digest: seedanceSurfaceImplementationDigests.prompt,
      },
    },
    {
      name: "speech",
      tag: "Speech",
      mode: "structured",
      outputs: [seedanceTypes.speechProgram, ...Object.values(seedanceEndpoints).map((endpoint) => endpoint.requestType)],
      implementation: {
        kind: "trusted-frontend-surface",
        locator: "@svml/seedance/speech-surface",
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
        locator: "@svml/seedance/video-surface",
        digest: seedanceSurfaceImplementationDigests.video,
      },
    },
  ],
  producers: [
    ...seedanceBaseDefinition.manifest.producers,
    ...seedanceModels.map((model) => ({
      name: seedanceSpeechCompileProducers[model].name,
      inputs: [
        { name: "program", type: seedanceTypes.speechProgram },
        { name: "duration", type: contractTypes.speechDuration },
      ],
      outputs: [{ name: "request", type: seedanceEndpointsByModel[model].requestType }],
      needs: [],
      implementation: {
        kind: "registered" as const,
        locator: `@svml/seedance/compile-${model}-speech-request`,
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
      handler: ({ inputs }: { readonly inputs: Readonly<Record<string, { readonly value: import("@svml/protocol").StoredValue }>> }) => ({
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
