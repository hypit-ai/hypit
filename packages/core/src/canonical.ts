import { createHash } from "node:crypto";

import type {
  CanonicalValue,
  Digest,
  StoredValue,
  TypeRef,
  TypedRecord,
} from "@svml/protocol";

import { CoreError } from "./error.js";

function normalize(value: unknown, path: string, ancestors: WeakSet<object>): CanonicalValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CoreError("NON_CANONICAL_NUMBER", `${path} must be finite`);
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new CoreError("CYCLIC_VALUE", `${path} contains a cycle`);
    ancestors.add(value);
    const result = value.map((item, index) => normalize(item, `${path}[${index}]`, ancestors));
    ancestors.delete(value);
    return result;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CoreError("NON_CANONICAL_OBJECT", `${path} must be a plain object`);
    }
    if (ancestors.has(value)) throw new CoreError("CYCLIC_VALUE", `${path} contains a cycle`);
    ancestors.add(value);

    const result: Record<string, CanonicalValue> = {};
    const source = value as Record<string, unknown>;
    for (const key of Object.keys(source).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
        throw new CoreError("NON_CANONICAL_ACCESSOR", `${path}.${key} must be a data property`);
      }
      const item = descriptor.value;
      if (item === undefined) {
        throw new CoreError("NON_CANONICAL_UNDEFINED", `${path}.${key} is undefined`);
      }
      Object.defineProperty(result, key, {
        value: normalize(item, `${path}.${key}`, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    ancestors.delete(value);
    return result;
  }

  throw new CoreError("NON_CANONICAL_VALUE", `${path} contains ${typeof value}`);
}

export function canonicalize(value: unknown): CanonicalValue {
  return normalize(value, "$input", new WeakSet<object>());
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function digestOf(value: unknown): Digest {
  const hex = createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function isDigest(value: string): value is Digest {
  return /^sha256:[0-9a-f]{64}$/u.test(value);
}

export function recordDigest(type: TypeRef, value: StoredValue): Digest {
  return digestOf({ type, value });
}

export function semanticRecordsDigest(records: readonly TypedRecord[]): Digest {
  return digestOf(
    [...records]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((record) => ({
        id: record.id,
        type: record.type,
        value: record.value,
        conformance: record.conformance,
      })),
  );
}
