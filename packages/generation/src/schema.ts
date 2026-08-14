import type { ObjectFieldSchema, ValueSchema } from "@narratage/protocol";

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
  images: {
    schema: {
      kind: "array",
      minItems: 1,
      maxItems: 16,
      items: generationBlobRefSchema,
    },
  },
});

export const generatedVideoSetSchema = generationObjectSchema({
  videos: {
    schema: {
      kind: "array",
      minItems: 1,
      maxItems: 8,
      items: generationBlobRefSchema,
    },
  },
});

export const generatedAudioSetSchema = generationObjectSchema({
  audios: {
    schema: {
      kind: "array",
      minItems: 1,
      maxItems: 16,
      items: generationBlobRefSchema,
    },
  },
});
