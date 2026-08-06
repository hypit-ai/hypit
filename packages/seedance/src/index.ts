import {
  assertGenerationBlobRef,
  generationBlobRefSchema,
  generationDigestSchema,
  generationObjectSchema,
  generationPromptSchema,
  sealGenerationRequest,
  verifyGenerationRequestDigest,
} from "@svml/generation";
import { defineExactModelModule } from "@svml/model-kit";
import type { BlobRef, Digest, ValueSchema } from "@svml/protocol";

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

export type SeedanceRequest<M extends SeedanceModel = SeedanceModel> = SeedanceRequestContent<M> & {
  readonly requestDigest: Digest;
};

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
    requestDigest: { schema: generationDigestSchema },
  });
}

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Seedance request must be an object");
  }
}

export function verifySeedanceRequest(value: unknown, expectedModel?: SeedanceModel): asserts value is SeedanceRequest {
  verifyGenerationRequestDigest(value);
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

export const seedanceDefinition = defineExactModelModule({
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

export const seedanceManifest = seedanceDefinition.manifest;
export const seedanceManifestDigest = seedanceDefinition.manifestDigest;
export const seedanceEndpoints = seedanceDefinition.endpoints;
export const seedanceComponent = seedanceDefinition.component;
