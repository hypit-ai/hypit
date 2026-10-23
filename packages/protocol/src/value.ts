import { isResourceId } from "./canonical.js";
import type { ResourceId } from "./identity.js";
import { compareCodeUnits } from "./order.js";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export type BlobRef = {
  readonly kind: "blob";
  /** One stored resource instance. Equal bytes stored twice keep distinct identities. */
  readonly resource: ResourceId;
  readonly size: number;
  readonly mediaType: string;
};

/** One graph value. BlobRef is a reserved leaf at any depth, not a separate value category. */
export type Value =
  | null
  | boolean
  | number
  | string
  | BlobRef
  | readonly Value[]
  | { readonly [key: string]: Value };

export type ValuePath = readonly (string | number)[];

export type ValueBlobRef = {
  readonly at: ValuePath;
  readonly blob: BlobRef;
};

export type BlobMappedValue<T> =
  | null
  | boolean
  | number
  | string
  | T
  | readonly BlobMappedValue<T>[]
  | { readonly [key: string]: BlobMappedValue<T> };

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

/** Opaque BlobRef shape for authoring and structural tools. */
export function blobRefSchema(mediaTypes?: readonly string[]): ValueSchema {
  return {
    kind: "blob",
    ...(mediaTypes === undefined ? {} : { mediaTypes }),
  };
}

/** Validate Protocol's runtime BlobRef representation without assigning domain media semantics. */
export function assertBlobRef(value: unknown, subject = "BlobRef"): asserts value is BlobRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} must be a BlobRef.`);
  }
  const item = value as Partial<BlobRef>;
  const keys = Object.keys(value).sort();
  if (keys.length !== 4 || keys[0] !== "kind" || keys[1] !== "mediaType"
    || keys[2] !== "resource" || keys[3] !== "size"
    || item.kind !== "blob" || typeof item.resource !== "string" || !isResourceId(item.resource)
    || !Number.isSafeInteger(item.size) || item.size! < 0
    || typeof item.mediaType !== "string" || item.mediaType.length === 0) {
    throw new Error(`${subject} must be a BlobRef.`);
  }
}

/** Whether a value is Protocol's exact reserved BlobRef leaf. */
export function isBlobRef(value: unknown): value is BlobRef {
  try {
    assertBlobRef(value);
    return true;
  } catch {
    return false;
  }
}

/** Validate and canonicalize one recursive graph value. */
export function normalizeValue(value: unknown, subject = "Value"): Value {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${subject} must contain only finite numbers.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeValue(item, `${subject}[${index}]`));
  }
  if (typeof value !== "object") throw new Error(`${subject} contains ${typeof value}.`);
  const item = value as Readonly<Record<string, unknown>>;
  if (item.kind === "blob") {
    assertBlobRef(item, subject);
    return {
      kind: "blob",
      resource: item.resource,
      size: item.size,
      mediaType: item.mediaType,
    };
  }
  const entries: [string, Value][] = [];
  for (const [key, child] of Object.entries(item).sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (child === undefined) throw new Error(`${subject}.${key} is undefined.`);
    entries.push([key, normalizeValue(child, `${subject}.${key}`)]);
  }
  return Object.fromEntries(entries);
}

/** Transform every BlobRef leaf while preserving the surrounding value structure and paths. */
export function mapValueBlobs<T>(
  value: Value,
  transform: (blob: BlobRef, at: ValuePath) => T,
  at: ValuePath = [],
): BlobMappedValue<T> {
  if (isBlobRef(value)) return transform(value, at);
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => mapValueBlobs(item, transform, [...at, index]));
  }
  return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, mapValueBlobs(item, transform, [...at, key])]));
}

/** Enumerate each recursive BlobRef occurrence without deduplicating Resource identity. */
export function valueBlobRefs(value: Value): readonly ValueBlobRef[] {
  const result: ValueBlobRef[] = [];
  mapValueBlobs(value, (blob, at) => {
    result.push({ at, blob });
    return null;
  });
  return result;
}
