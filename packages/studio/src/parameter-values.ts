import type { CanonicalValue, ValueSchema } from "@hypit/protocol";
import { formatSvsValue } from "@hypit/svs";

function fail(path: string, expectation: string): never {
  throw new Error(`${path} ${expectation}.`);
}

export function validateParameterValue(value: CanonicalValue, schema: ValueSchema, path: string): void {
  if (schema.kind === "null") {
    if (value !== null) fail(path, "expects null");
    return;
  }
  if (schema.kind === "boolean") {
    if (typeof value !== "boolean") fail(path, "expects true or false");
    return;
  }
  if (schema.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "expects a finite number");
    if (schema.integer === true && !Number.isInteger(value)) fail(path, "expects a whole number");
    if (schema.minimum !== undefined && value < schema.minimum) fail(path, `must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(path, `must be at most ${schema.maximum}`);
    return;
  }
  if (schema.kind === "string") {
    if (typeof value !== "string") fail(path, "expects text");
    if (schema.enum !== undefined && !schema.enum.includes(value)) fail(path, `does not accept ${value}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(path, "is too short");
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(path, "is too long");
    if (schema.format === "color" && !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value)) {
      fail(path, "expects #RRGGBB or #RRGGBBAA");
    }
    return;
  }
  if (schema.kind === "literal") {
    if (JSON.stringify(value) !== JSON.stringify(schema.value)) fail(path, "does not match its required literal");
    return;
  }
  if (schema.kind === "array") {
    if (!Array.isArray(value)) fail(path, "expects a list");
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(path, `requires at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(path, `accepts at most ${schema.maxItems} items`);
    value.forEach((item, index) => validateParameterValue(item, schema.items, `${path}[${index}]`));
    return;
  }
  if (schema.kind === "object") {
    if (value === null || Array.isArray(value) || typeof value !== "object") fail(path, "expects a record");
    const record = value as Readonly<Record<string, CanonicalValue>>;
    for (const [name, field] of Object.entries(schema.fields)) {
      const held = record[name];
      if (held === undefined) {
        if (field.optional !== true) fail(`${path}.${name}`, "is required");
      } else {
        validateParameterValue(held, field.schema, `${path}.${name}`);
      }
    }
    if (schema.allowUnknown !== true) {
      const unknown = Object.keys(record).find((name) => schema.fields[name] === undefined);
      if (unknown !== undefined) fail(`${path}.${unknown}`, "is not declared");
    }
    return;
  }
  if (schema.kind === "oneOf") {
    const accepted = schema.variants.some((variant) => {
      try {
        validateParameterValue(value, variant, path);
        return true;
      } catch {
        return false;
      }
    });
    if (!accepted) fail(path, "does not match an accepted value shape");
    return;
  }
  fail(path, "cannot edit blob values");
}

export function serializeParameterValue(value: CanonicalValue, language: "svml" | "svs" | "svrun"): string {
  if (language === "svs") return formatSvsValue(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`${language.toUpperCase()} parameter bindings currently accept scalar values only.`);
}
