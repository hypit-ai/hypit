import type {
  GenerationAuthoringControl,
  GenerationAuthoringItemField,
  GenerationAuthoringMediaList,
  GenerationAuthoringMediaListEntry,
  GenerationAuthoringMediaSlot,
  GenerationAuthoringScalar,
} from "@hypit/generation-graph";

import { isArtifactField, modelField } from "./fields.js";
import type { ModelArtifactField, ModelArtifactItemField, ModelFieldTable, ModelScalarKind } from "./fields.js";

function scalar(value: ModelScalarKind): GenerationAuthoringScalar {
  if (value.kind === "text") return { kind: "text", ...(value.maxChars === undefined ? {} : { maxChars: value.maxChars }) };
  if (value.kind === "enum") return { kind: "enum", values: [...value.values] };
  if (value.kind === "number") return {
    kind: "number",
    ...(value.integer === undefined ? {} : { integer: value.integer }),
    ...(value.minimum === undefined ? {} : { minimum: value.minimum }),
    ...(value.maximum === undefined ? {} : { maximum: value.maximum }),
  };
  if (value.kind === "boolean") return { kind: "boolean" };
  // Tokens are edited as bounded text. Their nominal meaning remains in the Model field validator.
  return { kind: "text", maxChars: value.maxLength };
}

function artifact(table: ModelFieldTable, name: string): ModelArtifactField {
  const field = modelField(table, name);
  if (!isArtifactField(field)) throw new Error(`${table.model}.${name} is not a media field.`);
  return field;
}

function itemFields(
  fields: readonly ModelArtifactItemField[] | undefined,
  bindings: Readonly<Record<string, GenerationAuthoringItemField["input"]>>,
  defaults: Readonly<Record<string, string | number | boolean>>,
): readonly GenerationAuthoringItemField[] | undefined {
  if (fields === undefined || fields.length === 0) return undefined;
  return fields.map((field) => ({
    name: field.name,
    input: bindings[field.name] ?? { kind: "suffix" },
    value: scalar(field.value),
    ...(field.optional === undefined ? {} : { optional: field.optional }),
    ...(defaults[field.name] === undefined ? {} : { default: defaults[field.name] }),
  }));
}

/** Derive a Graph literal editor from one exact model field without copying its schema into Canvas. */
export function modelAuthoringControl(
  table: ModelFieldTable,
  fieldName: string,
  options: {
    readonly id?: string;
    readonly input?: string;
    readonly required?: boolean;
    readonly default?: string | number | boolean;
  } = {},
): GenerationAuthoringControl {
  const field = modelField(table, fieldName);
  if (isArtifactField(field)) throw new Error(`${table.model}.${fieldName} is not a scalar field.`);
  return {
    id: options.id ?? fieldName,
    input: options.input ?? fieldName,
    value: scalar(field.value),
    required: options.required ?? (field.minItems > 0 && field.defaultItems === undefined && options.default === undefined),
    ...((options.default ?? field.defaultItems?.[0]) === undefined ? {} : {
      default: options.default ?? field.defaultItems![0],
    }),
  };
}

/** Derive one fixed media slot, including model-owned media roles and per-item metadata. */
export function modelAuthoringMediaSlot(
  table: ModelFieldTable,
  fieldName: string,
  options: {
    readonly id?: string;
    readonly input?: string;
    readonly required?: boolean;
    readonly itemBindings?: Readonly<Record<string, GenerationAuthoringItemField["input"]>>;
    readonly itemDefaults?: Readonly<Record<string, string | number | boolean>>;
  } = {},
): GenerationAuthoringMediaSlot {
  const field = artifact(table, fieldName);
  if (field.maxItems !== 1) throw new Error(`${table.model}.${fieldName} is not a fixed media slot.`);
  const items = itemFields(field.value.itemFields, options.itemBindings ?? {}, options.itemDefaults ?? {});
  return {
    id: options.id ?? fieldName,
    kind: "slot",
    input: options.input ?? fieldName,
    accepts: [...field.value.accepts],
    required: options.required ?? field.minItems > 0,
    ...(items === undefined ? {} : { itemFields: items }),
  };
}

export type ModelAuthoringMediaListField = {
  readonly field: string;
  readonly prefix?: string;
  readonly itemBindings?: Readonly<Record<string, GenerationAuthoringItemField["input"]>>;
  readonly itemDefaults?: Readonly<Record<string, string | number | boolean>>;
};

/**
 * Group one or more exact media fields into one Canvas list. Each role retains its own Graph prefix,
 * so the package resolver and Provider-facing Model request remain authoritative.
 */
export function modelAuthoringMediaList(
  table: ModelFieldTable,
  id: string,
  fields: readonly ModelAuthoringMediaListField[],
  options: { readonly minItems?: number; readonly maxItems?: number } = {},
): GenerationAuthoringMediaList {
  const entries: GenerationAuthoringMediaListEntry[] = [];
  let derivedMinimum = 0;
  let derivedMaximum = 0;
  let unbounded = false;
  for (const spec of fields) {
    const field = artifact(table, spec.field);
    derivedMinimum += field.minItems;
    if (field.maxItems === undefined) unbounded = true;
    else derivedMaximum += field.maxItems;
    const items = itemFields(field.value.itemFields, spec.itemBindings ?? {}, spec.itemDefaults ?? {});
    for (const role of field.value.accepts) {
      entries.push({
        role,
        prefix: spec.prefix ?? spec.field,
        ...(items === undefined ? {} : { itemFields: items }),
      });
    }
  }
  return {
    id,
    kind: "list",
    entries,
    minItems: options.minItems ?? derivedMinimum,
    ...((options.maxItems ?? (unbounded ? undefined : derivedMaximum)) === undefined ? {} : {
      maxItems: options.maxItems ?? derivedMaximum,
    }),
  };
}
