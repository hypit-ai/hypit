import type { CanonicalValue, ValueSchema } from "@hypit/protocol";
import { formatSvsValue } from "@hypit/svs";
import type { StudioInspectorField, StudioParameterOption, StudioNumberPresentation } from "@hypit/studio-adapter";

export const parameterOption = (option: StudioParameterOption): Exclude<StudioParameterOption, string> =>
  typeof option === "string" ? { value: option, label: option } : option;

// Keep binary floating-point residue out of decimal controls (0.55 × 100 is 55).
const scaledDecimal = (value: number, scale: number): number =>
  scale === 1 ? value : Number((value * scale).toPrecision(15));

export function parameterNumber(value: CanonicalValue, presentation: StudioNumberPresentation = {}): { value: number; suffix: string } {
  let held = value;
  let suffix = "";
  if (presentation.suffixes !== undefined) {
    if (typeof held !== "string") throw new Error("A suffixed number must be authored as text.");
    const text = held.trim();
    const found = [...presentation.suffixes].sort((a, b) => b.length - a.length).find(item => text.endsWith(item));
    if (found === undefined) throw new Error("The authored unit is not supported by this field.");
    suffix = found;
    held = text.slice(0, text.length - suffix.length).trim();
  }
  if (typeof held !== "number" && (typeof held !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(held.trim()))) {
    throw new Error("This field needs a numeric value.");
  }
  const number = scaledDecimal(Number(held), presentation.scale ?? 1);
  if (!Number.isFinite(number)) throw new Error("This field needs a finite number.");
  return { value: number, suffix };
}

/** Decode the displayed edit before validating and serializing the authored value. */
export function parameterAuthorValue(field: StudioInspectorField, displayed: CanonicalValue): CanonicalValue {
  if (field.control !== "number") return displayed;
  if (typeof displayed !== "number" || !Number.isFinite(displayed)) throw new Error(`${field.label} expects a finite number.`);
  const presentation = field.number ?? {};
  if (presentation.minimum !== undefined && displayed < presentation.minimum) throw new Error(`${field.label} must be at least ${presentation.minimum}.`);
  if (presentation.maximum !== undefined && displayed > presentation.maximum) throw new Error(`${field.label} must be at most ${presentation.maximum}.`);
  const value = scaledDecimal(displayed, 1 / (presentation.scale ?? 1));
  if (!Number.isFinite(value)) throw new Error(`${field.label} cannot be represented.`);
  return presentation.suffixes === undefined ? value : `${value}${parameterNumber(field.value, presentation).suffix}`;
}

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
  if (typeof value === "string") return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&apos;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`${language.toUpperCase()} parameter bindings currently accept scalar values only.`);
}
