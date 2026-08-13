import type { Digest } from "./identity.js";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export type BlobRef = {
  readonly kind: "blob";
  readonly digest: Digest;
  readonly size: number;
  readonly mediaType: string;
};

export type StoredValue =
  | {
      readonly kind: "inline";
      readonly value: CanonicalValue;
    }
  | BlobRef;

export type ValueSchema =
  | { readonly kind: "null" }
  | { readonly kind: "boolean" }
  | {
      readonly kind: "number";
      readonly integer?: boolean;
      readonly minimum?: number;
      readonly maximum?: number;
    }
  | {
      readonly kind: "string";
      readonly enum?: readonly string[];
      readonly minLength?: number;
      readonly maxLength?: number;
    }
  | {
      readonly kind: "literal";
      readonly value: CanonicalValue;
    }
  | {
      readonly kind: "array";
      readonly items: ValueSchema;
      readonly minItems?: number;
      readonly maxItems?: number;
    }
  | {
      readonly kind: "object";
      readonly fields: Readonly<Record<string, ObjectFieldSchema>>;
      readonly allowUnknown?: boolean;
    }
  | {
      readonly kind: "oneOf";
      readonly variants: readonly ValueSchema[];
    }
  | {
      readonly kind: "blob";
      readonly mediaTypes?: readonly string[];
      readonly maxBytes?: number;
    };

export type ObjectFieldSchema = {
  readonly schema: ValueSchema;
  readonly optional?: boolean;
};

/** Structural schema for a BlobRef nested inside an inline value. */
export function blobRefObjectSchema(mediaTypes?: readonly string[]): ValueSchema {
  return {
    kind: "object",
    fields: {
      kind: { schema: { kind: "literal", value: "blob" } },
      digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
      size: { schema: { kind: "number", integer: true, minimum: 0 } },
      mediaType: {
        schema: mediaTypes === undefined
          ? { kind: "string", minLength: 1 }
          : { kind: "string", enum: mediaTypes },
      },
    },
  };
}
