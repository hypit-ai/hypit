import {
  assertGenerationBlobRef,
  generationBlobRefSchema,
  generationObjectSchema,
  generationPromptSchema,
  sealGenerationRequest,
} from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import type { BlobRef, ValueSchema } from "@narratage/protocol";

export const seedreamModuleRef = { name: "@narratage/seedream", version: "0.0.0-dev" } as const;
export type SeedreamMode = "text" | "image";
type Common = {
  readonly contract: "svml.seedream-5-lite-request@1";
  readonly model: "seedream-5-lite";
  readonly prompt: string;
  readonly aspectRatio: string;
  readonly quality: "basic";
  readonly outputFormat: "png" | "jpg";
  /** Explicit author choice; the Provider never silently changes this policy. */
  readonly nsfwCheck: boolean;
};
export type SeedreamTextRequestContent = Common & { readonly mode: "text" };
export type SeedreamImageRequestContent = Common & {
  readonly mode: "image";
  readonly images: readonly BlobRef[];
};
export type SeedreamRequestContent = SeedreamTextRequestContent | SeedreamImageRequestContent;
export type SeedreamRequest = SeedreamRequestContent;

const commonFields = {
  contract: { schema: { kind: "literal", value: "svml.seedream-5-lite-request@1" } },
  model: { schema: { kind: "literal", value: "seedream-5-lite" } },
  prompt: { schema: generationPromptSchema },
  aspectRatio: { schema: { kind: "string", minLength: 3, maxLength: 16 } },
  quality: { schema: { kind: "literal", value: "basic" } },
  outputFormat: { schema: { kind: "string", enum: ["png", "jpg"] } },
  nsfwCheck: { schema: { kind: "boolean" } },
} as const;
const schemas: Record<SeedreamMode, ValueSchema> = {
  text: generationObjectSchema({
    ...commonFields,
    mode: { schema: { kind: "literal", value: "text" } },
  }),
  image: generationObjectSchema({
    ...commonFields,
    mode: { schema: { kind: "literal", value: "image" } },
    images: { schema: { kind: "array", minItems: 1, maxItems: 16, items: generationBlobRefSchema } },
  }),
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Seedream request must be an object");
  return value as Record<string, unknown>;
}

export function verifySeedreamRequest(value: unknown, expectedMode?: SeedreamMode): asserts value is SeedreamRequest {
  const request = object(value);
  if (request.contract !== "svml.seedream-5-lite-request@1" || request.model !== "seedream-5-lite") {
    throw new Error("Seedream request identity is invalid");
  }
  if (expectedMode !== undefined && request.mode !== expectedMode) throw new Error(`Expected Seedream ${expectedMode}`);
  if (request.mode === "image") {
    if (!Array.isArray(request.images) || request.images.length === 0) throw new Error("Seedream input images are empty");
    request.images.forEach((image) => assertGenerationBlobRef(image, "image/"));
  } else if (request.mode !== "text") {
    throw new Error("Seedream mode is invalid");
  }
}

export function sealSeedreamRequest<T extends SeedreamRequestContent>(
  content: T,
): T {
  const request = sealGenerationRequest(content);
  verifySeedreamRequest(request, content.mode);
  return request;
}

export const seedreamDefinition = defineExactModelModule({
  module: seedreamModuleRef,
  endpoints: (["text", "image"] as const).map((mode) => ({
    key: mode,
    requestTypeName: mode === "text" ? "Seedream5LiteTextRequest" : "Seedream5LiteImageRequest",
    capabilityName: `seedream-5-lite-${mode}-generation`,
    producerName: `request-seedream-5-lite-${mode}`,
    result: "image" as const,
    requestSchema: schemas[mode],
    verifyRequest: (value: unknown) => verifySeedreamRequest(value, mode),
  })),
});

export const seedreamManifest = seedreamDefinition.manifest;
export const seedreamManifestDigest = seedreamDefinition.manifestDigest;
export const seedreamEndpoints = seedreamDefinition.endpoints;
export const seedreamComponent = seedreamDefinition.component;
