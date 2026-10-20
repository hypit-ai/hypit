import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ObjectFieldSchema, ValueSchema } from "@hypit/hypit/protocol";

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
      items: blobRefSchema(),
    },
  },
});

export const generatedVideoSetSchema = generationObjectSchema({
  videos: {
    schema: {
      kind: "array",
      minItems: 1,
      items: blobRefSchema(),
    },
  },
});

export const generatedAudioSetSchema = generationObjectSchema({
  audios: {
    schema: {
      kind: "array",
      minItems: 1,
      items: blobRefSchema(),
    },
  },
});
