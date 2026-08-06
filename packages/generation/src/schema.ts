import type { ObjectFieldSchema, ValueSchema } from "@svml/protocol";

export const generationDigestSchema = {
  kind: "string",
  minLength: 71,
  maxLength: 71,
} as const satisfies ValueSchema;

export const generationPromptSchema = {
  kind: "string",
  minLength: 1,
  maxLength: 20_000,
} as const satisfies ValueSchema;

export const generationBlobRefSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "blob" } },
    digest: { schema: generationDigestSchema },
    size: { schema: { kind: "number", integer: true, minimum: 0 } },
    mediaType: { schema: { kind: "string", minLength: 1, maxLength: 255 } },
  },
} as const satisfies ValueSchema;

export function generationObjectSchema(
  fields: Readonly<Record<string, ObjectFieldSchema>>,
): ValueSchema {
  return { kind: "object", fields };
}

export const generatedImageSetSchema = generationObjectSchema({
  contract: { schema: { kind: "literal", value: "svml.generated-image-set@1" } },
  model: { schema: { kind: "string", minLength: 1, maxLength: 255 } },
  requestDigest: { schema: generationDigestSchema },
  images: {
    schema: {
      kind: "array",
      minItems: 1,
      maxItems: 16,
      items: generationBlobRefSchema,
    },
  },
  resultDigest: { schema: generationDigestSchema },
});

export const generatedVideoSetSchema = generationObjectSchema({
  contract: { schema: { kind: "literal", value: "svml.generated-video-set@1" } },
  model: { schema: { kind: "string", minLength: 1, maxLength: 255 } },
  requestDigest: { schema: generationDigestSchema },
  requestedDurationSec: { schema: { kind: "number", minimum: 0 } },
  videos: {
    schema: {
      kind: "array",
      minItems: 1,
      maxItems: 8,
      items: generationBlobRefSchema,
    },
  },
  resultDigest: { schema: generationDigestSchema },
});
