import {
  assertGenerationBlobRef,
  generationBlobRefSchema,
  generationObjectSchema,
  generationPromptSchema,
  sealGenerationRequest,
} from "@svml/generation";
import { defineExactModelModule } from "@svml/model-kit";
import type { BlobRef, ValueSchema } from "@svml/protocol";

export const nanoBananaModuleRef = { name: "@svml/nano-banana", version: "0.0.0-dev" } as const;
export const nanoBananaModels = ["nano-banana-2", "nano-banana-pro"] as const;
export type NanoBananaModel = typeof nanoBananaModels[number];
export type NanoBananaRequestContent<M extends NanoBananaModel = NanoBananaModel> = {
  readonly contract: "svml.nano-banana-request@1";
  readonly model: M;
  readonly prompt: string;
  readonly images?: readonly BlobRef[];
  readonly aspectRatio: string;
  readonly resolution: "1K" | "2K" | "4K";
  readonly outputFormat: "png" | "jpg";
};
export type NanoBananaRequest<M extends NanoBananaModel = NanoBananaModel> = NanoBananaRequestContent<M>;

function requestSchema(model: NanoBananaModel): ValueSchema {
  return generationObjectSchema({
    contract: { schema: { kind: "literal", value: "svml.nano-banana-request@1" } },
    model: { schema: { kind: "literal", value: model } },
    prompt: { schema: generationPromptSchema },
    images: {
      schema: { kind: "array", minItems: 1, maxItems: 16, items: generationBlobRefSchema },
      optional: true,
    },
    aspectRatio: { schema: { kind: "string", minLength: 3, maxLength: 16 } },
    resolution: { schema: { kind: "string", enum: ["1K", "2K", "4K"] } },
    outputFormat: { schema: { kind: "string", enum: ["png", "jpg"] } },
  });
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Nano Banana request must be an object");
  return value as Record<string, unknown>;
}

export function verifyNanoBananaRequest(value: unknown, expectedModel?: NanoBananaModel): asserts value is NanoBananaRequest {
  const request = object(value);
  if (request.contract !== "svml.nano-banana-request@1"
    || !nanoBananaModels.includes(request.model as NanoBananaModel)) {
    throw new Error("Nano Banana request identity is invalid");
  }
  if (expectedModel !== undefined && request.model !== expectedModel) throw new Error(`Expected ${expectedModel}`);
  if (request.images !== undefined) {
    if (!Array.isArray(request.images) || request.images.length === 0) throw new Error("Nano Banana images are invalid");
    request.images.forEach((image) => assertGenerationBlobRef(image, "image/"));
  }
}

export function sealNanoBananaRequest<M extends NanoBananaModel>(
  content: NanoBananaRequestContent<M>,
): NanoBananaRequest<M> {
  const request = sealGenerationRequest(content);
  verifyNanoBananaRequest(request, content.model);
  return request;
}

export const nanoBananaDefinition = defineExactModelModule({
  module: nanoBananaModuleRef,
  endpoints: (["nano-banana-2", "nano-banana-pro"] as const).map((model) => ({
    key: model === "nano-banana-2" ? "v2" : "pro",
    requestTypeName: model === "nano-banana-2" ? "NanoBanana2Request" : "NanoBananaProRequest",
    capabilityName: `${model}-generation`,
    producerName: `request-${model}`,
    result: "image" as const,
    requestSchema: requestSchema(model),
    verifyRequest: (value: unknown) => verifyNanoBananaRequest(value, model),
  })),
});

export const nanoBananaManifest = nanoBananaDefinition.manifest;
export const nanoBananaManifestDigest = nanoBananaDefinition.manifestDigest;
export const nanoBananaEndpoints = nanoBananaDefinition.endpoints;
export const nanoBananaComponent = nanoBananaDefinition.component;
