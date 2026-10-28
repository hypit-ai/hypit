import { blobRefSchema, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, ObjectFieldSchema, ValueSchema } from "@hypit/hypit/protocol";
import { verifyText } from "@hypit/hypit/text";
import type { Text } from "@hypit/hypit/text";

import { assertGenerationBlobRef } from "./identity.js";
import { objectSchema } from "./schema.js";
import { assertModelFieldTable, isArtifactField } from "./fields.js";
import type {
  ModelArtifactField,
  ModelArtifactRole,
  ModelArtifactItemField,
  ModelField,
  ModelScalarKind,
  ModelFieldTable,
  ModelFieldValue,
} from "./fields.js";

/** Request shape owned by the optional field-oriented Model adapter. */
export type ModelFieldRequest = {
  /** An absent field is an omitted key. A present field always carries at least one value. */
  readonly fields: Readonly<Record<string, readonly ModelFieldValue[]>>;
};

/** Field request while graph inputs are still being attached. */
export type ModelFieldBuilder = {
  readonly fields: Readonly<Record<string, readonly ModelFieldValue[]>>;
};

/** Authored instructions for attaching one graph Blob edge to one artifact field. */
export type ModelArtifactBinding = {
  readonly role: ModelArtifactRole;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function plainObject(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function mediaPrefix(role: ModelArtifactRole): "image/" | "video/" | "audio/" {
  return `${role}/` as "image/" | "video/" | "audio/";
}

function scalarSchema(value: ModelScalarKind): ValueSchema {
  if (value.kind === "text") return {
    kind: "string",
    minLength: 1,
    ...(value.maxChars === undefined ? {} : { maxLength: value.maxChars }),
  };
  if (value.kind === "token") return { kind: "string", minLength: value.minLength, maxLength: value.maxLength };
  if (value.kind === "boolean") return { kind: "boolean" };
  if (value.kind === "number") {
    return {
      kind: "number",
      ...(value.integer === undefined ? {} : { integer: value.integer }),
      ...(value.minimum === undefined ? {} : { minimum: value.minimum }),
      ...(value.maximum === undefined ? {} : { maximum: value.maximum }),
    };
  }
  const strings = value.values.every((item): item is string => typeof item === "string");
  if (strings) return { kind: "string", enum: [...value.values] };
  return { kind: "oneOf", variants: value.values.map((item) => ({ kind: "literal" as const, value: item })) };
}

function itemFieldsSchema(fields: readonly ModelArtifactItemField[]): ValueSchema {
  return objectSchema(Object.fromEntries(fields.map((field) => [field.name, {
    schema: scalarSchema(field.value),
    ...(field.optional === true ? { optional: true } : {}),
  } satisfies ObjectFieldSchema])));
}

/** Schema for the non-artifact half of one artifact-field attachment. */
export function artifactBindingSchema(field: ModelArtifactField): ValueSchema {
  const fields = field.value.itemFields ?? [];
  return objectSchema({
    role: { schema: { kind: "string", enum: [...field.value.accepts] } },
    ...(fields.length === 0 ? {} : { fields: { schema: itemFieldsSchema(fields) } }),
  });
}

function fieldItemSchema(field: ModelField): ValueSchema {
  if (!isArtifactField(field)) return scalarSchema(field.value);
  const media = field.value;
  return objectSchema({
    role: { schema: { kind: "string", enum: [...media.accepts] } },
    artifact: { schema: blobRefSchema() },
    ...(media.itemFields === undefined || media.itemFields.length === 0
      ? {}
      : { fields: { schema: itemFieldsSchema(media.itemFields) } }),
  });
}

export type ModelFieldSubset = {
  /**
   * Ports supplied later rather than by this value. A duration-dependent
   * compilation authors everything else first and completes the request when
   * the missing fact exists.
   */
  readonly omit?: readonly string[];
  /**
   * Ports that may be absent while a graph is still attaching values. If they
   * are present, their item and cardinality rules are still checked. Exact
   * Result writing never uses this escape hatch.
   */
  readonly defer?: readonly string[];
};

/** Derive the Schema of the field map alone, optionally leaving some fields for later. */
export function modelFieldsSchema(
  table: ModelFieldTable,
  options: ModelFieldSubset = {},
): ValueSchema {
  assertModelFieldTable(table);
  const omit = new Set(options.omit ?? []);
  const defer = new Set(options.defer ?? []);
  omit.forEach((name) => assert(table.fields.some((field) => field.name === name),
    `${table.model} cannot omit undeclared field ${name}`));
  defer.forEach((name) => {
    assert(table.fields.some((field) => field.name === name), `${table.model} cannot defer undeclared field ${name}`);
    assert(!omit.has(name), `${table.model} cannot both omit and defer field ${name}`);
  });
  return objectSchema(Object.fromEntries(table.fields
    .filter((field) => !omit.has(field.name))
    .map((field) => [field.name, {
      schema: {
        kind: "array",
        items: fieldItemSchema(field),
        minItems: Math.max(1, field.minItems),
        ...(field.maxItems === undefined ? {} : { maxItems: field.maxItems }),
      },
      ...(field.minItems === 0 || defer.has(field.name) ? { optional: true } : {}),
    } satisfies ObjectFieldSchema])));
}

/** Derive the structural Schema of one Model request from its field table. */
export function modelFieldRequestSchema(table: ModelFieldTable): ValueSchema {
  return objectSchema({
    fields: { schema: modelFieldsSchema(table) },
  });
}

/** Structural schema for the model-owned request draft used by graph assembly. */
export function modelFieldBuilderSchema(table: ModelFieldTable): ValueSchema {
  return objectSchema({
    fields: { schema: modelFieldsSchema(table, { defer: deferredFields(table) }) },
  });
}

function verifyScalar(value: unknown, kind: ModelScalarKind, subject: string): void {
  if (kind.kind === "text") {
    assert(typeof value === "string" && value.length > 0, `${subject} must be non-empty text`);
    if (kind.maxChars !== undefined) {
      assert(value.length <= kind.maxChars, `${subject} must contain at most ${kind.maxChars} characters`);
    }
    return;
  }
  if (kind.kind === "token") {
    assert(typeof value === "string" && value.length >= kind.minLength && value.length <= kind.maxLength,
      `${subject} must be a token of ${kind.minLength} to ${kind.maxLength} characters`);
    return;
  }
  if (kind.kind === "boolean") {
    assert(typeof value === "boolean", `${subject} must be a boolean`);
    return;
  }
  if (kind.kind === "number") {
    assert(typeof value === "number" && Number.isFinite(value), `${subject} must be a finite number`);
    if (kind.integer === true) assert(Number.isSafeInteger(value), `${subject} must be an integer`);
    if (kind.minimum !== undefined) assert(value >= kind.minimum, `${subject} must be at least ${kind.minimum}`);
    if (kind.maximum !== undefined) assert(value <= kind.maximum, `${subject} must be at most ${kind.maximum}`);
    return;
  }
  assert(
    (typeof value === "string" || typeof value === "number") && kind.values.includes(value),
    `${subject} must be one of ${kind.values.join(", ")}`,
  );
}

function verifyMediaItemFields(value: Record<string, unknown>, field: ModelArtifactField, subject: string): void {
  const media = field.value;
  const role = value.role;
  assert(typeof role === "string" && media.accepts.includes(role as ModelArtifactRole),
    `${subject} role must be one of ${media.accepts.join(", ")}`);
  const declared = media.itemFields ?? [];
  if (declared.length === 0) {
    assert(value.fields === undefined, `${subject} declares no item fields`);
    return;
  }
  const fields = plainObject(value.fields ?? {}, `${subject} fields`);
  const known = new Set(declared.map((field) => field.name));
  Object.keys(fields).forEach((name) => assert(known.has(name), `${subject} has unknown item field ${name}`));
  for (const field of declared) {
    const present = Object.prototype.hasOwnProperty.call(fields, field.name);
    if (!present) {
      assert(field.optional === true, `${subject} is missing item field ${field.name}`);
      continue;
    }
    verifyScalar(fields[field.name], field.value, `${subject} item field ${field.name}`);
  }
  for (const rule of media.itemRequires ?? []) {
    const values = rule.fields.map((name) => fields[name]).filter((item) => item !== undefined);
    if (values.length < rule.fields.length) continue;
    for (let index = 1; index < values.length; index += 1) {
      assert((values[index] as number) > (values[index - 1] as number),
        `${subject} requires ${rule.fields.join(" < ")}`);
    }
  }
}

function verifyMediaValue(value: unknown, field: ModelArtifactField, subject: string): void {
  const item = plainObject(value, subject);
  verifyMediaItemFields(item, field, subject);
  assertGenerationBlobRef(item.artifact, mediaPrefix(item.role as ModelArtifactRole));
}

/**
 * Full standalone verification against the field table. Core's generic schema
 * type-owner validation runs first; this adds the facts a Schema cannot state, such as the
 * media type each role demands and the Model's field combination rules.
 */
export function verifyModelFields(
  table: ModelFieldTable,
  value: unknown,
  options: ModelFieldSubset = {},
): void {
  assertModelFieldTable(table);
  const omit = new Set(options.omit ?? []);
  const defer = new Set(options.defer ?? []);
  const fields = plainObject(value, `${table.model} fields`);
  const declared = new Map(table.fields.map((field) => [field.name, field]));
  Object.keys(fields).forEach((name) => {
    assert(declared.has(name), `${table.model} names undeclared field ${name}`);
    assert(!omit.has(name), `${table.model} field ${name} is supplied later and must be absent here`);
  });

  const present = new Set<string>();
  for (const field of table.fields) {
    if (omit.has(field.name)) continue;
    const subject = `${table.model} field ${field.name}`;
    const supplied = fields[field.name];
    if (supplied === undefined) {
      assert(field.minItems === 0 || defer.has(field.name), `${subject} is required`);
      continue;
    }
    assert(Array.isArray(supplied), `${subject} must be an array`);
    assert(supplied.length >= Math.max(1, field.minItems),
      `${subject} needs at least ${Math.max(1, field.minItems)} value(s)`);
    if (field.maxItems !== undefined) {
      assert(supplied.length <= field.maxItems, `${subject} accepts at most ${field.maxItems} value(s)`);
    }
    present.add(field.name);
    supplied.forEach((item, index) => {
      const label = field.maxItems === 1 ? subject : `${subject}[${index}]`;
      if (isArtifactField(field)) verifyMediaValue(item, field, label);
      else verifyScalar(item, field.value, label);
    });
  }

  for (const requirement of table.requires) {
    if (requirement.kind === "atMostOneOf") {
      const used = requirement.fields.filter((name) => present.has(name));
      assert(used.length <= 1,
        `${table.model} accepts at most one of ${requirement.fields.join(", ")} but received ${used.join(", ")}`);
      continue;
    }
    if (requirement.kind === "requiresAnyOf") {
      if (!present.has(requirement.field)) continue;
      const satisfied = requirement.anyOf.some((name) => present.has(name) || omit.has(name) || defer.has(name));
      assert(satisfied,
        `${table.model} field ${requirement.field} needs at least one of ${requirement.anyOf.join(", ")}`);
      continue;
    }
    if (requirement.kind === "weightedTotal") {
      const total = Object.entries(requirement.weights).reduce((sum, [name, weight]) => {
        const supplied = fields[name];
        return sum + (Array.isArray(supplied) ? supplied.length : 0) * weight;
      }, 0);
      assert(total <= requirement.maximum,
        `${table.model} uses ${total} of its ${requirement.maximum} shared ${Object.keys(requirement.weights).sort().join("/")} budget`);
      continue;
    }
    if (!present.has(requirement.field)) continue;
    const missing = requirement.needs.filter((name) => !present.has(name) && !omit.has(name) && !defer.has(name));
    assert(missing.length === 0,
      `${table.model} field ${requirement.field} also requires ${missing.join(", ")}`);
  }
}

function deferredFields(table: ModelFieldTable): readonly string[] {
  return table.fields
    .filter((field) => isArtifactField(field) || field.value.kind === "text"
      || (!isArtifactField(field) && field.defaultItems !== undefined))
    .map((field) => field.name);
}

export function verifyModelFieldBuilder(
  table: ModelFieldTable,
  value: unknown,
): asserts value is ModelFieldBuilder {
  const draft = plainObject(value, `${table.model} request draft`);
  verifyModelFields(table, draft.fields, { defer: deferredFields(table) });
}

export function sealModelFieldBuilder(
  table: ModelFieldTable,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldBuilder {
  const draft = canonicalize({
    fields: Object.fromEntries(Object.entries(fields).filter(([, values]) => values.length > 0)),
  }) as unknown as ModelFieldBuilder;
  verifyModelFieldBuilder(table, draft);
  return draft;
}

export function verifyModelArtifactBinding(
  field: ModelArtifactField,
  value: unknown,
): asserts value is ModelArtifactBinding {
  const binding = plainObject(value, `${field.name} artifact binding`);
  verifyMediaItemFields(binding, field, `${field.name} artifact binding`);
}

export function sealModelArtifactBinding(
  field: ModelArtifactField,
  value: ModelArtifactBinding,
): ModelArtifactBinding {
  const binding = canonicalize(value) as unknown as ModelArtifactBinding;
  verifyModelArtifactBinding(field, binding);
  return binding;
}

/**
 * Attach one Blob supplied by a real graph edge. The returned draft contains
 * the Provider-facing value, while the Graph preserves where that Blob came
 * from; no lineage or project metadata is copied through the payload.
 */
export function bindModelArtifact(
  table: ModelFieldTable,
  draft: ModelFieldBuilder,
  fieldName: string,
  binding: ModelArtifactBinding,
  artifact: BlobRef,
): ModelFieldBuilder {
  verifyModelFieldBuilder(table, draft);
  const field = table.fields.find((candidate): candidate is ModelArtifactField =>
    candidate.name === fieldName && isArtifactField(candidate));
  assert(field !== undefined, `${table.model} has no artifact field ${fieldName}`);
  verifyModelArtifactBinding(field, binding);
  const value = {
    role: binding.role,
    artifact,
    ...(binding.fields === undefined ? {} : { fields: binding.fields }),
  };
  verifyMediaValue(value, field, `${table.model} field ${fieldName}`);
  return sealModelFieldBuilder(table, {
    ...draft.fields,
    [fieldName]: [...(draft.fields[fieldName] ?? []), value],
  });
}

/** Attach one graph Text edge to an exact text field without hiding it in metadata. */
export function bindModelText(
  table: ModelFieldTable,
  draft: ModelFieldBuilder,
  fieldName: string,
  text: Text,
): ModelFieldBuilder {
  verifyModelFieldBuilder(table, draft);
  verifyText(text);
  const field = table.fields.find((candidate) =>
    candidate.name === fieldName && candidate.value.kind === "text");
  assert(field !== undefined, `${table.model} has no text field ${fieldName}`);
  return sealModelFieldBuilder(table, {
    ...draft.fields,
    [fieldName]: [...(draft.fields[fieldName] ?? []), text.value],
  });
}

export function finalizeModelFieldBuilder(
  table: ModelFieldTable,
  draft: ModelFieldBuilder,
): ModelFieldRequest {
  verifyModelFieldBuilder(table, draft);
  return sealModelFieldRequest(table, draft.fields);
}

export function verifyModelFieldRequest(
  table: ModelFieldTable,
  value: unknown,
): asserts value is ModelFieldRequest {
  assertModelFieldTable(table);
  const request = plainObject(value, `${table.model} request`);
  verifyModelFields(table, request.fields);
}

/** Build one canonical request for a Model from its declared fields. */
export function sealModelFieldRequest(
  table: ModelFieldTable,
  fields: Readonly<Record<string, readonly ModelFieldValue[]>>,
): ModelFieldRequest {
  const stated = Object.fromEntries(
    Object.entries(fields).filter(([, values]) => values !== undefined && values.length > 0),
  );
  const finalized = Object.fromEntries(table.fields.map((field) => [
    field.name,
    stated[field.name] ?? (!isArtifactField(field) ? field.defaultItems : undefined),
  ]).filter((entry): entry is [string, readonly ModelFieldValue[]] => entry[1] !== undefined));
  const request = canonicalize({
    fields: finalized,
  }) as unknown as ModelFieldRequest;
  verifyModelFieldRequest(table, request);
  return request;
}

/** Which fields this request actually populates; drives Provider routing and coverage. */
export function presentModelFields(request: ModelFieldRequest): ReadonlySet<string> {
  return new Set(Object.keys(request.fields));
}
