import {
  assertGenerationBlobRef,
  generationBlobRefSchema,
  generationObjectSchema,
  generationPromptSchema,
  sealGenerationRequest,
} from "@narratage/generation";
import { defineExactModelModule } from "@narratage/model-kit";
import type { BlobRef, ValueSchema } from "@narratage/protocol";

export const grokImagineModuleRef = { name: "@narratage/grok-imagine", version: "0.0.0-dev" } as const;
export type GrokImagineMode = "text" | "image" | "preview-1.5";

type Common = {
  readonly contract: "svml.grok-imagine-video-request@1";
  readonly prompt: string;
  readonly aspectRatio: string;
  readonly resolution: "480p" | "720p";
  readonly durationSec: number;
};
export type GrokImagineTextRequestContent = Common & {
  readonly model: "grok-imagine-video";
  readonly mode: "text";
};
export type GrokImagineImageRequestContent = Common & {
  readonly model: "grok-imagine-video";
  readonly mode: "image";
  readonly images: readonly BlobRef[];
  /** Optional KIE continuation identity; omitted for ordinary image-to-video. */
  readonly sourceTaskId?: string;
};
export type GrokImaginePreviewRequestContent = Common & {
  readonly model: "grok-imagine-video-1.5-preview";
  readonly mode: "preview-1.5";
  readonly images?: readonly BlobRef[];
};
export type GrokImagineRequestContent =
  | GrokImagineTextRequestContent
  | GrokImagineImageRequestContent
  | GrokImaginePreviewRequestContent;
export type GrokImagineRequest = GrokImagineRequestContent;

const aspectSchema = { kind: "string", minLength: 3, maxLength: 16 } as const satisfies ValueSchema;
const commonFields = {
  contract: { schema: { kind: "literal", value: "svml.grok-imagine-video-request@1" } },
  prompt: { schema: generationPromptSchema },
  aspectRatio: { schema: aspectSchema },
  resolution: { schema: { kind: "string", enum: ["480p", "720p"] } },
  durationSec: { schema: { kind: "number", integer: true, minimum: 1, maximum: 15 } },
} as const;
const schemas: Record<GrokImagineMode, ValueSchema> = {
  text: generationObjectSchema({
    ...commonFields,
    model: { schema: { kind: "literal", value: "grok-imagine-video" } },
    mode: { schema: { kind: "literal", value: "text" } },
  }),
  image: generationObjectSchema({
    ...commonFields,
    model: { schema: { kind: "literal", value: "grok-imagine-video" } },
    mode: { schema: { kind: "literal", value: "image" } },
    images: { schema: { kind: "array", minItems: 1, maxItems: 4, items: generationBlobRefSchema } },
    sourceTaskId: { schema: { kind: "string", minLength: 1, maxLength: 255 }, optional: true },
  }),
  "preview-1.5": generationObjectSchema({
    ...commonFields,
    model: { schema: { kind: "literal", value: "grok-imagine-video-1.5-preview" } },
    mode: { schema: { kind: "literal", value: "preview-1.5" } },
    images: {
      schema: { kind: "array", minItems: 1, maxItems: 4, items: generationBlobRefSchema },
      optional: true,
    },
  }),
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Grok Imagine request must be an object");
  return value as Record<string, unknown>;
}

export function verifyGrokImagineRequest(value: unknown, expectedMode?: GrokImagineMode): asserts value is GrokImagineRequest {
  const request = object(value);
  if (request.contract !== "svml.grok-imagine-video-request@1") throw new Error("Grok Imagine request contract is invalid");
  if (expectedMode !== undefined && request.mode !== expectedMode) throw new Error(`Expected Grok Imagine ${expectedMode}`);
  if (request.mode === "image") {
    if (request.model !== "grok-imagine-video" || !Array.isArray(request.images) || request.images.length === 0) {
      throw new Error("Grok Imagine image request is invalid");
    }
    request.images.forEach((image) => assertGenerationBlobRef(image, "image/"));
  } else if (request.mode === "preview-1.5") {
    if (request.model !== "grok-imagine-video-1.5-preview") throw new Error("Grok Imagine preview model is invalid");
    if (request.images !== undefined) {
      if (!Array.isArray(request.images)) throw new Error("Grok Imagine preview images are invalid");
      request.images.forEach((image) => assertGenerationBlobRef(image, "image/"));
    }
  } else if (request.mode === "text") {
    if (request.model !== "grok-imagine-video") throw new Error("Grok Imagine text model is invalid");
  } else {
    throw new Error("Grok Imagine mode is invalid");
  }
}

export function sealGrokImagineRequest<T extends GrokImagineRequestContent>(
  content: T,
): T {
  const request = sealGenerationRequest(content);
  verifyGrokImagineRequest(request, content.mode);
  return request;
}

export const grokImagineDefinition = defineExactModelModule({
  module: grokImagineModuleRef,
  endpoints: (["text", "image", "preview-1.5"] as const).map((mode) => ({
    key: mode,
    requestTypeName: mode === "text" ? "GrokImagineTextVideoRequest"
      : mode === "image" ? "GrokImagineImageVideoRequest" : "GrokImagine15PreviewRequest",
    capabilityName: `grok-imagine-${mode}-video-generation`,
    producerName: `request-grok-imagine-${mode}`,
    result: "video" as const,
    requestSchema: schemas[mode],
    verifyRequest: (value: unknown) => verifyGrokImagineRequest(value, mode),
  })),
});

export const grokImagineManifest = grokImagineDefinition.manifest;
export const grokImagineManifestDigest = grokImagineDefinition.manifestDigest;
export const grokImagineEndpoints = grokImagineDefinition.endpoints;
export const grokImagineComponent = grokImagineDefinition.component;
