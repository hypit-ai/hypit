import type { CanonicalValue, StoredValue, ValueSchema } from "@narratage/protocol";

import { canonicalStringify, isDigest } from "./canonical.js";
import { CoreError, invariant } from "./error.js";

function fail(path: string, message: string): never {
  throw new CoreError("VALUE_SCHEMA_MISMATCH", `${path} ${message}`, path);
}

/**
 * Prove that an object-shaped union branch cannot match by looking only at its
 * literal fields. This is a semantic no-op: a branch skipped here would fail
 * the normal object validation at the same field. It matters for large
 * discriminated IRs, where trying every named union variant would otherwise
 * construct thousands of exceptions before finding a literal mismatch.
 */
function objectLiteralMismatch(value: CanonicalValue, schema: ValueSchema): boolean {
  if (schema.kind !== "object" || value === null || Array.isArray(value) || typeof value !== "object") {
    return false;
  }
  const object = value as Readonly<Record<string, CanonicalValue>>;
  for (const [name, field] of Object.entries(schema.fields)) {
    if (field.schema.kind !== "literal") continue;
    if (!Object.hasOwn(object, name)) return field.optional !== true;
    if (canonicalStringify(object[name] as CanonicalValue) !== canonicalStringify(field.schema.value)) {
      return true;
    }
  }
  return false;
}

function validateInline(value: CanonicalValue, schema: ValueSchema, path: string): void {
  switch (schema.kind) {
    case "null":
      if (value !== null) fail(path, "must be null");
      return;
    case "boolean":
      if (typeof value !== "boolean") fail(path, "must be a boolean");
      return;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "must be a number");
      if (schema.integer === true && !Number.isInteger(value)) fail(path, "must be an integer");
      if (schema.minimum !== undefined && value < schema.minimum) {
        fail(path, `must be >= ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        fail(path, `must be <= ${schema.maximum}`);
      }
      return;
    case "string":
      if (typeof value !== "string") fail(path, "must be a string");
      if (schema.enum !== undefined && !schema.enum.includes(value)) {
        fail(path, `must be one of ${schema.enum.join(", ")}`);
      }
      if (schema.minLength !== undefined && [...value].length < schema.minLength) {
        fail(path, `must contain at least ${schema.minLength} characters`);
      }
      if (schema.maxLength !== undefined && [...value].length > schema.maxLength) {
        fail(path, `must contain at most ${schema.maxLength} characters`);
      }
      return;
    case "literal":
      if (canonicalStringify(value) !== canonicalStringify(schema.value)) {
        fail(path, "does not match the literal value");
      }
      return;
    case "array":
      if (!Array.isArray(value)) fail(path, "must be an array");
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        fail(path, `must contain at least ${schema.minItems} items`);
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        fail(path, `must contain at most ${schema.maxItems} items`);
      }
      value.forEach((item, index) => validateInline(item, schema.items, `${path}[${index}]`));
      return;
    case "object": {
      if (value === null || Array.isArray(value) || typeof value !== "object") {
        fail(path, "must be an object");
      }
      const object = value as Readonly<Record<string, CanonicalValue>>;
      for (const [name, field] of Object.entries(schema.fields)) {
        if (!Object.hasOwn(object, name)) {
          if (field.optional !== true) fail(`${path}.${name}`, "is required");
          continue;
        }
        validateInline(object[name] as CanonicalValue, field.schema, `${path}.${name}`);
      }
      if (schema.allowUnknown !== true) {
        for (const name of Object.keys(object)) {
          if (!Object.hasOwn(schema.fields, name)) fail(`${path}.${name}`, "is not declared");
        }
      }
      return;
    }
    case "oneOf": {
      let matches = 0;
      for (const variant of schema.variants) {
        if (objectLiteralMismatch(value, variant)) continue;
        try {
          validateInline(value, variant, path);
          matches += 1;
        } catch (error) {
          if (!(error instanceof CoreError) || error.code !== "VALUE_SCHEMA_MISMATCH") throw error;
        }
      }
      if (matches !== 1) fail(path, `must match exactly one variant, matched ${matches}`);
      return;
    }
    case "blob":
      fail(path, "must be a blob reference");
  }
}

export function validateStoredValue(value: StoredValue, schema: ValueSchema, path = "$value"): void {
  if (schema.kind === "blob") {
    invariant(value.kind === "blob", "VALUE_SCHEMA_MISMATCH", `${path} must be a blob`, path);
    invariant(isDigest(value.digest), "INVALID_BLOB", `${path}.digest is invalid`, path);
    invariant(Number.isSafeInteger(value.size) && value.size >= 0, "INVALID_BLOB", `${path}.size is invalid`);
    invariant(value.mediaType.length > 0, "INVALID_BLOB", `${path}.mediaType is empty`, path);
    if (schema.maxBytes !== undefined) {
      invariant(value.size <= schema.maxBytes, "VALUE_SCHEMA_MISMATCH", `${path} exceeds maxBytes`, path);
    }
    if (schema.mediaTypes !== undefined) {
      invariant(
        schema.mediaTypes.includes(value.mediaType),
        "VALUE_SCHEMA_MISMATCH",
        `${path}.mediaType is not accepted`,
        path,
      );
    }
    return;
  }

  invariant(value.kind === "inline", "VALUE_SCHEMA_MISMATCH", `${path} must be inline`, path);
  validateInline(value.value, schema, path);
}
