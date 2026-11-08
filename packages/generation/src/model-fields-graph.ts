import type {
  GenerationCompiledOperationNode,
  GenerationGraphInput,
} from "@hypit/hypit/generation-graph";
import { canonicalize } from "@hypit/hypit/protocol";

import { isArtifactField, modelField } from "./fields.js";
import {
  createFieldModelPrimaryFragment,
  modelArtifactInputNames,
  modelTextFieldInputName,
  type FieldModelOperation,
} from "./model.js";
import {
  sealModelArtifactBinding,
  type ModelArtifactBinding,
  type ModelFieldBuilder,
} from "./request.js";

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
