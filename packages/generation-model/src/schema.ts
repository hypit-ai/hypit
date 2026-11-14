import { blobRefSchema } from "@hypit/protocol/value";
import type { ObjectFieldSchema, ValueSchema } from "@hypit/protocol/value";

export function objectSchema(
  fields: Readonly<Record<string, ObjectFieldSchema>>,
): ValueSchema {
  return { kind: "object", fields };
}

export const generatedImageSetSchema = objectSchema({
  images: {
    schema: {
      kind: "array",
      minItems: 1,
      items: blobRefSchema(),
    },
  },
});

export const generatedVideoSetSchema = objectSchema({
  videos: {
    schema: {
      kind: "array",
      minItems: 1,
      items: blobRefSchema(),
    },
  },
});

export const generatedAudioSetSchema = objectSchema({
  audios: {
    schema: {
      kind: "array",
      minItems: 1,
      items: blobRefSchema(),
    },
  },
});
