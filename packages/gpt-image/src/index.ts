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

export const gptImageModuleRef = { name: "@svml/gpt-image", version: "0.0.0-dev" } as const;
export type GptImage2Mode = "text" | "image";
type Common = {
  readonly contract: "svml.gpt-image-2-request@1";
  readonly model: "gpt-image-2";
  readonly prompt: string;
  readonly aspectRatio: string;
};
export type GptImage2TextRequestContent = Common & { readonly mode: "text" };
export type GptImage2ImageRequestContent = Common & {
  readonly mode: "image";
  readonly images: readonly BlobRef[];
};
export type GptImage2RequestContent = GptImage2TextRequestContent | GptImage2ImageRequestContent;
export type GptImage2Request = GptImage2RequestContent & { readonly requestDigest: Digest };

const commonFields = {
  contract: { schema: { kind: "literal", value: "svml.gpt-image-2-request@1" } },
  model: { schema: { kind: "literal", value: "gpt-image-2" } },
  prompt: { schema: generationPromptSchema },
  aspectRatio: { schema: { kind: "string", minLength: 3, maxLength: 16 } },
  requestDigest: { schema: generationDigestSchema },
} as const;
const schemas: Record<GptImage2Mode, ValueSchema> = {
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("GPT Image 2 request must be an object");
  return value as Record<string, unknown>;
}

export function verifyGptImage2Request(value: unknown, expectedMode?: GptImage2Mode): asserts value is GptImage2Request {
  verifyGenerationRequestDigest(value);
  const request = object(value);
  if (request.contract !== "svml.gpt-image-2-request@1" || request.model !== "gpt-image-2") {
    throw new Error("GPT Image 2 request identity is invalid");
  }
  if (expectedMode !== undefined && request.mode !== expectedMode) throw new Error(`Expected GPT Image 2 ${expectedMode}`);
  if (request.mode === "image") {
    if (!Array.isArray(request.images) || request.images.length === 0) throw new Error("GPT Image 2 input images are empty");
    request.images.forEach((image) => assertGenerationBlobRef(image, "image/"));
  } else if (request.mode !== "text") {
    throw new Error("GPT Image 2 mode is invalid");
  }
}

export function sealGptImage2Request<T extends GptImage2RequestContent>(
  content: T,
): T & { readonly requestDigest: Digest } {
  const request = sealGenerationRequest(content);
  verifyGptImage2Request(request, content.mode);
  return request;
}

export const gptImageDefinition = defineExactModelModule({
  module: gptImageModuleRef,
  endpoints: (["text", "image"] as const).map((mode) => ({
    key: mode,
    requestTypeName: mode === "text" ? "GptImage2TextRequest" : "GptImage2ImageRequest",
    capabilityName: `gpt-image-2-${mode}-generation`,
    producerName: `request-gpt-image-2-${mode}`,
    result: "image" as const,
    requestSchema: schemas[mode],
    verifyRequest: (value: unknown) => verifyGptImage2Request(value, mode),
  })),
});

export const gptImageManifest = gptImageDefinition.manifest;
export const gptImageManifestDigest = gptImageDefinition.manifestDigest;
export const gptImageEndpoints = gptImageDefinition.endpoints;
export const gptImageComponent = gptImageDefinition.component;
