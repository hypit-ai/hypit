import type { BlobRef } from "@hypit/hypit/protocol";

/**
 * Optional field vocabulary describing what one exact Model accepts.
 *
 * A Model's input fields are decided by that Model: which reference
 * images, audio, video or text it can consume is a property of the model, not
 * of the service reselling it. A Provider therefore never redeclares this
 * shape; it only maps each declared field onto its own wire fields.
 */
export type ModelArtifactRole = "image" | "video" | "audio";

export const MODEL_ARTIFACT_ROLES: readonly ModelArtifactRole[] = ["image", "video", "audio"];

export type ModelScalarKind =
  | { readonly kind: "text"; readonly maxChars?: number }
  | { readonly kind: "token"; readonly minLength: number; readonly maxLength: number }
  | { readonly kind: "enum"; readonly values: readonly (string | number)[] }
  | {
      readonly kind: "number";
      readonly integer?: boolean;
      readonly minimum?: number;
      readonly maximum?: number;
    }
  | { readonly kind: "boolean" };

/** A scalar carried alongside one media item, such as a trimmed excerpt boundary. */
export type ModelArtifactItemField = {
  readonly name: string;
  readonly value: ModelScalarKind;
  readonly optional?: boolean;
};

/** Relation between two item fields of the same media item, such as a trim window. */
export type ModelItemRequirement = {
  readonly kind: "strictlyIncreasing";
  readonly fields: readonly string[];
};

export type ModelArtifactFieldKind = {
  readonly kind: "media";
  readonly accepts: readonly ModelArtifactRole[];
  readonly itemFields?: readonly ModelArtifactItemField[];
  readonly itemRequires?: readonly ModelItemRequirement[];
};

export type ModelFieldKind = ModelScalarKind | ModelArtifactFieldKind;

type ModelFieldBase = {
  readonly name: string;
  readonly minItems: number;
  /** Omit when the Model contract has no owned finite ceiling. */
  readonly maxItems?: number;
};

export type ModelScalarValue = string | number | boolean;

export type ModelScalarField = ModelFieldBase & {
  readonly value: ModelScalarKind;
  /**
   * Model-owned values inserted when an author omits this field. Defaults are
   * part of request finalization: every complete request carries them
   * explicitly, so Providers never infer model semantics.
   */
  readonly defaultItems?: readonly ModelScalarValue[];
};
export type ModelArtifactField = ModelFieldBase & { readonly value: ModelArtifactFieldKind };

/**
 * One named input field. `minItems: 0` means the finalized Model request works
 * without it; a required scalar may still be author-optional when its Model
 * declares `defaultItems`. `maxItems: 1` means the field carries one value.
 */
export type ModelField = ModelScalarField | ModelArtifactField;

export type ModelFieldRequirement =
  | { readonly kind: "atMostOneOf"; readonly fields: readonly string[] }
  | { readonly kind: "requiresPresent"; readonly field: string; readonly needs: readonly string[] }
  /** This field needs company, but any one of several will do — reference audio needs a visual. */
  | { readonly kind: "requiresAnyOf"; readonly field: string; readonly anyOf: readonly string[] }
  /** A shared budget several fields draw from, such as a total reference quota. */
  | {
      readonly kind: "weightedTotal";
      readonly weights: Readonly<Record<string, number>>;
      readonly maximum: number;
    };

export type ModelFieldTable = {
  /** Exact model identity; this is also the Capability name. */
  readonly model: string;
  readonly fields: readonly ModelField[];
  readonly requires: readonly ModelFieldRequirement[];
};

export type ModelArtifactValue = {
  readonly role: ModelArtifactRole;
  readonly artifact: BlobRef;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
};

export type ModelFieldValue = ModelScalarValue | ModelArtifactValue;

const PORT_NAME = /^[a-z][A-Za-z0-9]*$/u;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isArtifactField(field: ModelField): field is ModelArtifactField {
  return field.value.kind === "media";
}

function assertScalarKind(value: ModelScalarKind, subject: string): void {
  if (value.kind === "text") {
    if (value.maxChars !== undefined) {
      assert(Number.isSafeInteger(value.maxChars) && value.maxChars > 0, `${subject} maxChars is invalid`);
    }
    return;
  }
  if (value.kind === "token") {
    assert(Number.isSafeInteger(value.minLength) && value.minLength >= 1, `${subject} minLength is invalid`);
    assert(Number.isSafeInteger(value.maxLength) && value.maxLength >= value.minLength, `${subject} maxLength is invalid`);
    return;
  }
  if (value.kind === "enum") {
    assert(value.values.length > 0, `${subject} enum is empty`);
    assert(new Set(value.values).size === value.values.length, `${subject} enum repeats a value`);
    value.values.forEach((item) => assert(
      typeof item === "string" ? item.length > 0 : Number.isFinite(item),
      `${subject} enum contains an invalid value`,
    ));
    return;
  }
  if (value.kind === "number") {
    if (value.minimum !== undefined) assert(Number.isFinite(value.minimum), `${subject} minimum is invalid`);
    if (value.maximum !== undefined) assert(Number.isFinite(value.maximum), `${subject} maximum is invalid`);
    if (value.minimum !== undefined && value.maximum !== undefined) {
      assert(value.maximum >= value.minimum, `${subject} numeric bounds are inverted`);
    }
    return;
  }
  assert(value.kind === "boolean", `${subject} has an unsupported field kind`);
}

function assertScalarValue(value: unknown, kind: ModelScalarKind, subject: string): void {
  if (kind.kind === "text") {
    assert(typeof value === "string" && value.length > 0, `${subject} must be non-empty text`);
    if (kind.maxChars !== undefined) assert(value.length <= kind.maxChars, `${subject} exceeds maxChars`);
    return;
  }
  if (kind.kind === "token") {
    assert(typeof value === "string" && value.length >= kind.minLength && value.length <= kind.maxLength,
      `${subject} must satisfy the token length`);
    return;
  }
  if (kind.kind === "boolean") {
    assert(typeof value === "boolean", `${subject} must be boolean`);
    return;
  }
  if (kind.kind === "number") {
    assert(typeof value === "number" && Number.isFinite(value), `${subject} must be finite`);
    if (kind.integer === true) assert(Number.isSafeInteger(value), `${subject} must be an integer`);
    if (kind.minimum !== undefined) assert(value >= kind.minimum, `${subject} is below minimum`);
    if (kind.maximum !== undefined) assert(value <= kind.maximum, `${subject} exceeds maximum`);
    return;
  }
  assert((typeof value === "string" || typeof value === "number") && kind.values.includes(value),
    `${subject} must be one of the declared enum values`);
}

export function assertModelFieldTable(value: ModelFieldTable): void {
  assert(typeof value.model === "string" && value.model.trim().length > 0, "Model field table identity is empty");
  assert(value.fields.length > 0, `${value.model} declares no input field`);

  const names = new Set<string>();
  for (const field of value.fields) {
    const subject = `${value.model} field ${field.name}`;
    assert(PORT_NAME.test(field.name), `${subject} name is invalid`);
    assert(!names.has(field.name), `${subject} is declared twice`);
    names.add(field.name);
    assert(Number.isSafeInteger(field.minItems) && field.minItems >= 0, `${subject} minItems is invalid`);
    if (field.maxItems !== undefined) {
      assert(Number.isSafeInteger(field.maxItems) && field.maxItems >= Math.max(1, field.minItems),
        `${subject} maxItems is invalid`);
    }
    if (isArtifactField(field)) {
      const media = field.value;
      assert(media.accepts.length > 0, `${subject} accepts no media role`);
      assert(new Set(media.accepts).size === media.accepts.length, `${subject} repeats a media role`);
      media.accepts.forEach((role) => assert(MODEL_ARTIFACT_ROLES.includes(role), `${subject} media role ${role} is invalid`));
      const fields = new Set<string>();
      for (const field of media.itemFields ?? []) {
        assert(PORT_NAME.test(field.name), `${subject} item field name is invalid`);
        assert(!fields.has(field.name), `${subject} item field ${field.name} is declared twice`);
        fields.add(field.name);
        assertScalarKind(field.value, `${subject} item field ${field.name}`);
      }
      for (const rule of media.itemRequires ?? []) {
        assert(rule.kind === "strictlyIncreasing", `${subject} declares an unsupported item requirement`);
        assert(rule.fields.length >= 2, `${subject} strictlyIncreasing needs at least two item fields`);
        rule.fields.forEach((name) => assert(fields.has(name),
          `${subject} strictlyIncreasing names unknown item field ${name}`));
      }
    } else {
      assertScalarKind(field.value, subject);
      if (field.defaultItems !== undefined) {
        assert(field.minItems > 0, `${subject} defaults require a non-zero minItems`);
        assert(field.defaultItems.length >= field.minItems, `${subject} has too few default items`);
        if (field.maxItems !== undefined) {
          assert(field.defaultItems.length <= field.maxItems, `${subject} has too many default items`);
        }
        field.defaultItems.forEach((item, index) => assertScalarValue(item, field.value,
          `${subject} defaultItems[${index}]`));
      }
    }
  }

  for (const requirement of value.requires) {
    if (requirement.kind === "atMostOneOf") {
      assert(requirement.fields.length >= 2, `${value.model} atMostOneOf needs at least two fields`);
      requirement.fields.forEach((name) => assert(names.has(name),
        `${value.model} atMostOneOf names unknown field ${name}`));
      assert(new Set(requirement.fields).size === requirement.fields.length,
        `${value.model} atMostOneOf repeats a field`);
      continue;
    }
    if (requirement.kind === "requiresAnyOf") {
      assert(names.has(requirement.field), `${value.model} requiresAnyOf names unknown field ${requirement.field}`);
      assert(requirement.anyOf.length >= 1, `${value.model} requiresAnyOf lists no companion field`);
      requirement.anyOf.forEach((name) => {
        assert(names.has(name), `${value.model} requiresAnyOf names unknown field ${name}`);
        assert(name !== requirement.field, `${value.model} requiresAnyOf ${name} depends on itself`);
      });
      continue;
    }
    if (requirement.kind === "weightedTotal") {
      const entries = Object.entries(requirement.weights);
      assert(entries.length >= 1, `${value.model} weightedTotal lists no field`);
      entries.forEach(([name, weight]) => {
        assert(names.has(name), `${value.model} weightedTotal names unknown field ${name}`);
        assert(Number.isFinite(weight) && weight > 0, `${value.model} weightedTotal weight for ${name} is invalid`);
      });
      assert(Number.isFinite(requirement.maximum) && requirement.maximum > 0,
        `${value.model} weightedTotal maximum is invalid`);
      continue;
    }
    assert(requirement.kind === "requiresPresent", `${value.model} declares an unsupported requirement`);
    assert(names.has(requirement.field), `${value.model} requiresPresent names unknown field ${requirement.field}`);
    assert(requirement.needs.length > 0, `${value.model} requiresPresent lists no prerequisite`);
    requirement.needs.forEach((name) => {
      assert(names.has(name), `${value.model} requiresPresent names unknown field ${name}`);
      assert(name !== requirement.field, `${value.model} requiresPresent ${name} depends on itself`);
    });
  }
}

export function defineModelFields(value: ModelFieldTable): ModelFieldTable {
  assertModelFieldTable(value);
  return value;
}

export function modelField(table: ModelFieldTable, name: string): ModelField {
  const field = table.fields.find((item) => item.name === name);
  if (field === undefined) throw new Error(`${table.model} declares no field ${name}`);
  return field;
}
