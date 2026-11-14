import { sameType } from "@hypit/module";
import type { GenerationCompiledOperationNode, GenerationComponentRef, GenerationGraphInput, GenerationOperationNodeDeclaration, GenerationNodeAuthoringShape, GenerationAuthoringMediaRole, } from "@hypit/generation-graph";
import { blobTypes } from "@hypit/blob";
import { promptTypes, sealPrompt } from "@hypit/prompt";
import { canonicalize } from "@hypit/protocol/value";
import { sealText, textTypes } from "@hypit/text";

import { isArtifactField, modelField } from "./fields.js";
import type { ModelArtifactRole, ModelFieldTable, ModelFieldValue } from "./fields.js";
import {
  modelAuthoringControl,
  modelAuthoringMediaList,
  modelAuthoringMediaSlot,
} from "./model-fields-authoring.js";
import {
  createFieldModelPrimaryFragment,
  modelArtifactInputNames,
  modelTextFieldInputName,
  type FieldModelOperation,
} from "./model.js";
import {
  sealModelFieldBuilder,
  sealModelArtifactBinding,
  type ModelArtifactBinding,
  type ModelFieldBuilder,
} from "./request.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function authoredText(input: GenerationGraphInput, type: import("@hypit/module").TypeRef): GenerationGraphInput {
  if ("node" in input || typeof input.value !== "string") return input;
  if (sameType(type, promptTypes.prompt)) return { value: canonicalize(sealPrompt(input.value)) };
  if (sameType(type, textTypes.text)) return { value: canonicalize(sealText(input.value)) };
  throw new Error(`Inline authoring is unavailable for textual Type ${type.module.name}/${type.name}.`);
}

function presenceRequirements(table: ModelFieldTable, counts: Readonly<Record<string, number>>, subject: string): void {
  const present = (name: string) => (counts[name] ?? 0) > 0;
  for (const requirement of table.requires) {
    if (requirement.kind === "atMostOneOf") {
      const used = requirement.fields.filter(present);
      assert(used.length <= 1, `${subject} accepts at most one of ${requirement.fields.join(", ")} but received ${used.join(", ")}.`);
    } else if (requirement.kind === "atLeastOneOf") {
      assert(requirement.fields.some(present), `${subject} needs at least one of ${requirement.fields.join(", ")}.`);
    } else if (requirement.kind === "requiresPresent") {
      if (present(requirement.field)) {
        const missing = requirement.needs.filter((name) => !present(name));
        assert(missing.length === 0, `${subject} field ${requirement.field} also requires ${missing.join(", ")}.`);
      }
    } else if (requirement.kind === "requiresAnyOf") {
      assert(!present(requirement.field) || requirement.anyOf.some(present),
        `${subject} field ${requirement.field} needs at least one of ${requirement.anyOf.join(", ")}.`);
    } else {
      const total = Object.entries(requirement.weights)
        .reduce((sum, [name, weight]) => sum + (counts[name] ?? 0) * weight, 0);
      assert(total <= requirement.maximum, `${subject} uses ${total} of its ${requirement.maximum} shared budget.`);
    }
  }
}

export type FieldModelGraphArtifactInput = ModelArtifactBinding & {
  /** Stable Fragment-local name; it need not equal the Model field name. */
  readonly name: string;
  readonly field: string;
  readonly source: GenerationGraphInput;
};

export type FieldModelGraphTextInput = {
  readonly name: string;
  readonly field: string;
  readonly source: GenerationGraphInput;
};

export type IndexedFieldModelArtifactSpec = {
  /** Authored port prefix. Defaults to the Model field name. */
  readonly port?: string;
  readonly field: string;
  readonly role: ModelArtifactBinding["role"];
};

export type CollectedIndexedFieldModelArtifacts = {
  readonly artifacts: readonly FieldModelGraphArtifactInput[];
  readonly consumed: ReadonlySet<string>;
};

/**
 * Define an ordinary field-model Graph node without central model knowledge. The calling package
 * still owns the exact component identity and may use a custom resolver for richer authored modes.
 */
export function createFieldModelGenerationNode(options: {
  readonly using: GenerationComponentRef;
  readonly endpoint: FieldModelOperation;
  readonly output: GenerationAuthoringMediaRole;
  readonly defaults?: Readonly<Record<string, string | number | boolean>>;
}): GenerationOperationNodeDeclaration {
  const table = options.endpoint.fields;
  const controls = table.fields.filter((field) => !isArtifactField(field)).map((field) =>
    modelAuthoringControl(table, field.name, {
      ...(options.defaults?.[field.name] === undefined ? {} : { default: options.defaults[field.name] }),
    }));
  const ports = table.fields.filter(isArtifactField).map((field) => field.maxItems === 1
    ? modelAuthoringMediaSlot(table, field.name)
    : modelAuthoringMediaList(table, field.name, [{ field: field.name }]));
  const authoring: GenerationNodeAuthoringShape = {
    using: options.using,
    output: { type: blobTypes.blob, connectable: true, media: [options.output] },
    controls,
    ports,
    ...(table.requires.length === 0 ? {} : { rules: structuredClone(table.requires) }),
  };
  return {
    kind: "operation",
    using: options.using,
    output: blobTypes.blob,
    authoring,
    resolve({ node }) {
      const subject = `${table.model} Node ${node.id}`;
      const consumed = new Set<string>();
      const draftFields: Record<string, readonly ModelFieldValue[]> = {};
      const artifacts: FieldModelGraphArtifactInput[] = [];
      const textFields: FieldModelGraphTextInput[] = [];
      const counts: Record<string, number> = {};

      for (const field of table.fields) {
        if (!isArtifactField(field)) {
          const input = node.inputs[field.name];
          if (input === undefined) {
            const defaultValue = options.defaults?.[field.name];
            if (defaultValue !== undefined) {
              draftFields[field.name] = [defaultValue];
              counts[field.name] = 1;
            } else if (field.defaultItems !== undefined) {
              draftFields[field.name] = [...field.defaultItems];
              counts[field.name] = field.defaultItems.length;
            }
            continue;
          }
          consumed.add(field.name);
          if (field.value.kind === "text") {
            textFields.push({ name: field.name, field: field.name,
              source: authoredText(input, field.value.inputType ?? textTypes.text) });
            counts[field.name] = 1;
          } else {
            assert("value" in input, `${subject} input ${field.name} must be an authored value.`);
            draftFields[field.name] = [input.value as ModelFieldValue];
            counts[field.name] = 1;
          }
          continue;
        }

        assert(field.value.accepts.length === 1,
          `${subject} field ${field.name} needs a package-owned role selector.`);
        const role = field.value.accepts[0] as ModelArtifactRole;
        if (field.maxItems === 1) {
          const source = node.inputs[field.name];
          if (source === undefined) continue;
          consumed.add(field.name);
          const itemValues: Record<string, string | number | boolean> = {};
          for (const itemField of field.value.itemFields ?? []) {
            const key = `${field.name}.${itemField.name}`;
            const value = node.inputs[key];
            if (value === undefined) continue;
            assert("value" in value && ["string", "number", "boolean"].includes(typeof value.value),
              `${subject} input ${key} must be an authored scalar value.`);
            itemValues[itemField.name] = value.value as string | number | boolean;
            consumed.add(key);
          }
          artifacts.push({ name: field.name, field: field.name, role, source,
            ...(Object.keys(itemValues).length === 0 ? {} : { fields: itemValues }) });
          counts[field.name] = 1;
        } else {
          const collected = collectIndexedFieldModelArtifacts({
            endpoint: options.endpoint,
            inputs: node.inputs,
            fields: [{ field: field.name, role }],
            subject,
          });
          artifacts.push(...collected.artifacts);
          collected.consumed.forEach((name) => consumed.add(name));
          counts[field.name] = collected.artifacts.length;
        }
      }
      for (const name of Object.keys(node.inputs)) assert(consumed.has(name), `${subject} has unknown input ${name}.`);

      const missing = table.fields.flatMap((field) => {
        const count = counts[field.name] ?? 0;
        const hasDefault = !isArtifactField(field) && (field.defaultItems !== undefined
          || options.defaults?.[field.name] !== undefined);
        return count < field.minItems && !hasDefault ? [field.name] : [];
      });
      for (const rule of table.requires) {
        if (rule.kind === "atLeastOneOf" && !rule.fields.some((name) => (counts[name] ?? 0) > 0)) {
          missing.push(rule.fields.join(" | "));
        }
        if (rule.kind === "requiresPresent" && (counts[rule.field] ?? 0) > 0) {
          missing.push(...rule.needs.filter((name) => (counts[name] ?? 0) === 0));
        }
        if (rule.kind === "requiresAnyOf" && (counts[rule.field] ?? 0) > 0
          && !rule.anyOf.some((name) => (counts[name] ?? 0) > 0)) missing.push(rule.anyOf.join(" | "));
      }
      const consumedInputs = [...consumed];
      if (missing.length > 0) return { kind: "incomplete", consumedInputs, missing: [...new Set(missing)] };
      presenceRequirements(table, counts, subject);
      return {
        kind: "ready",
        consumedInputs,
        compiled: fieldModelGraphOperation({
          endpoint: options.endpoint,
          draft: sealModelFieldBuilder(table, draftFields),
          artifacts,
          textFields,
        }),
      };
    },
  };
}

/**
 * Read repeatable media edges from `<port>.<1-based index>` and optional
 * `<port>.<index>.<itemField>` inputs. Each Model package chooses which fields
 * expose this authoring form; the exact field table still validates metadata.
 */
export function collectIndexedFieldModelArtifacts(options: {
  readonly endpoint: FieldModelOperation;
  readonly inputs: Readonly<Record<string, GenerationGraphInput>>;
  readonly fields: readonly IndexedFieldModelArtifactSpec[];
  readonly subject: string;
}): CollectedIndexedFieldModelArtifacts {
  const specs = new Map(options.fields.map((item) => [item.port ?? item.field, item]));
  if (specs.size !== options.fields.length) {
    throw new Error(`${options.subject} repeats an indexed media port.`);
  }
  const found = new Map<string, {
    readonly port: string;
    readonly spec: IndexedFieldModelArtifactSpec;
    readonly index: number;
    source?: GenerationGraphInput;
    fields: Record<string, string | number | boolean>;
  }>();
  const consumed = new Set<string>();
  for (const [name, input] of Object.entries(options.inputs)) {
    const parts = name.split(".");
    if (parts.length !== 2 && parts.length !== 3) continue;
    const spec = specs.get(parts[0]!);
    if (spec === undefined || !/^[1-9][0-9]*$/u.test(parts[1]!)) continue;
    const index = Number(parts[1]);
    const key = `${parts[0]}.${index}`;
    const item = found.get(key) ?? {
      port: parts[0]!,
      spec,
      index,
      fields: {},
    };
    if (parts.length === 2) {
      item.source = input;
    } else {
      if (!("value" in input)
        || (typeof input.value !== "string" && typeof input.value !== "number" && typeof input.value !== "boolean")) {
        throw new Error(`${options.subject} input ${name} must be an authored scalar value.`);
      }
      item.fields[parts[2]!] = input.value;
    }
    found.set(key, item);
    consumed.add(name);
  }
  const artifacts: FieldModelGraphArtifactInput[] = [];
  for (const spec of options.fields) {
    const port = spec.port ?? spec.field;
    const items = [...found.values()].filter((item) => item.port === port)
      .sort((left, right) => left.index - right.index);
    items.forEach((item, offset) => {
      if (item.index !== offset + 1) {
        throw new Error(`${options.subject} ${port} indices must be contiguous from 1.`);
      }
      if (item.source === undefined) {
        throw new Error(`${options.subject} ${port}.${item.index} is missing its media input.`);
      }
      artifacts.push({
        name: `${port}.${item.index}`,
        field: spec.field,
        role: spec.role,
        ...(Object.keys(item.fields).length === 0 ? {} : { fields: item.fields }),
        source: item.source,
      });
    });
  }
  // Validate item-field names, required values and scalar kinds before a Fragment is returned.
  for (const artifact of artifacts) {
    const field = modelField(options.endpoint.fields, artifact.field);
    if (!isArtifactField(field)) {
      throw new Error(`${options.endpoint.fields.model}.${artifact.field} is not an artifact field.`);
    }
    sealModelArtifactBinding(field, artifact);
  }
  return { artifacts, consumed };
}

/**
 * Graph counterpart of `fieldModelAuthorComponent`: close one package-owned
 * field-model invocation without exposing its request envelope in the recipe.
 */
export function fieldModelGraphOperation(options: {
  readonly endpoint: FieldModelOperation;
  readonly draft: ModelFieldBuilder;
  readonly artifacts?: readonly FieldModelGraphArtifactInput[];
  readonly textFields?: readonly FieldModelGraphTextInput[];
}): GenerationCompiledOperationNode {
  const artifacts = options.artifacts ?? [];
  const textFields = options.textFields ?? [];
  const names = [...artifacts, ...textFields].map((input) => input.name);
  if (new Set(names).size !== names.length) {
    throw new Error(`${options.endpoint.fields.model} graph inputs must have unique local names.`);
  }
  options.endpoint.validateDraft(options.draft);
  for (const field of options.endpoint.fields.fields) {
    const draftCount = options.draft.fields[field.name]?.length ?? 0;
    const edgeCount = artifacts.filter((input) => input.field === field.name).length
      + textFields.filter((input) => input.field === field.name).length;
    const total = draftCount + edgeCount;
    if (field.maxItems !== undefined && total > field.maxItems) {
      throw new Error(`${options.endpoint.fields.model} field ${field.name} accepts at most ${field.maxItems} value(s).`);
    }
    const hasDefault = "defaultItems" in field && field.defaultItems !== undefined;
    if (total < field.minItems && !hasDefault) {
      throw new Error(`${options.endpoint.fields.model} field ${field.name} needs at least ${field.minItems} value(s).`);
    }
  }
  presenceRequirements(options.endpoint.fields, Object.fromEntries(options.endpoint.fields.fields.map((field) => [
    field.name,
    (options.draft.fields[field.name]?.length ?? 0)
      + artifacts.filter((input) => input.field === field.name).length
      + textFields.filter((input) => input.field === field.name).length,
  ])), options.endpoint.fields.model);
  const inputs: Record<string, GenerationGraphInput> = {
    draft: { value: canonicalize(options.draft) },
  };
  for (const input of textFields) {
    const binding = options.endpoint.textFieldBindings[input.field];
    if (binding === undefined) {
      throw new Error(`${options.endpoint.fields.model} has no text field ${input.field}.`);
    }
    inputs[modelTextFieldInputName(input.name)] = input.source;
  }
  for (const input of artifacts) {
    const binding = options.endpoint.mediaBindings[input.field];
    if (binding === undefined) {
      throw new Error(`${options.endpoint.fields.model} has no artifact field ${input.field}.`);
    }
    const field = modelField(options.endpoint.fields, input.field);
    if (!isArtifactField(field)) {
      throw new Error(`${options.endpoint.fields.model}.${input.field} is not an artifact field.`);
    }
    const ports = modelArtifactInputNames(input.name);
    inputs[ports.binding] = {
      value: canonicalize(sealModelArtifactBinding(field, {
        role: input.role,
        ...(input.fields === undefined ? {} : { fields: input.fields }),
      })),
    };
    inputs[ports.artifact] = input.source;
  }
  return {
    fragment: createFieldModelPrimaryFragment(
      options.endpoint,
      artifacts.map(({ name, field }) => ({ name, field })),
      textFields.map(({ name, field }) => ({ name, field })),
    ),
    inputs,
  };
}
