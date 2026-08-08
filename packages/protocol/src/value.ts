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

/**
 * What a value means beyond its type.
 *
 * `kind` says a value is a string; `format` says the string is a colour rather
 * than a font family, or that a number is a fraction of a dimension rather than
 * a count. Two values with one type and different meanings are indistinguishable
 * without it, so anything reading a schema to present, diagnose or document a
 * value has to be told the difference somewhere — and a module's own type
 * declaration is where the difference is actually known.
 *
 * Deliberately closed and small. A format is a claim about the value, never an
 * instruction to a renderer: a Host decides that a `color` is best edited with a
 * swatch, and nothing here says so.
 */
export type ValueFormat =
  /** `#RRGGBB` or `#RRGGBBAA`. */
  | "color"
  /** A fraction of a containing dimension, normally 0 to 1. */
  | "unit-fraction"
  /** Prose that may contain line breaks and is read rather than matched. */
  | "multiline"
  /** Seconds. */
  | "duration"
  /** A content-addressed `sha256:` identity. */
  | "digest";

export type ValueSchema =
  | { readonly kind: "null" }
  | { readonly kind: "boolean" }
  | {
      readonly kind: "number";
      readonly integer?: boolean;
      readonly minimum?: number;
      readonly maximum?: number;
      readonly format?: ValueFormat;
    }
  | {
      readonly kind: "string";
      readonly enum?: readonly string[];
      readonly minLength?: number;
      readonly maxLength?: number;
      readonly format?: ValueFormat;
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
