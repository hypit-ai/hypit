import type { BlobRef } from "@hypit/protocol";

/**
 * The closed vocabulary describing what one exact generation model accepts.
 *
 * A model's input ports are decided when the model is trained: which reference
 * images, audio, video or text it can consume is a property of the model, not
 * of the service reselling it. A Provider therefore never redeclares this
 * shape; it only maps each declared port onto its own wire fields.
 *
 * Adding a port kind changes this package's public vocabulary, not one model's table.
 */
export type GenerationMediaRole = "image" | "video" | "audio";

export const GENERATION_MEDIA_ROLES: readonly GenerationMediaRole[] = ["image", "video", "audio"];

export type GenerationPortScalarKind =
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
export type GenerationPortItemField = {
  readonly name: string;
  readonly value: GenerationPortScalarKind;
  readonly optional?: boolean;
};

/** Relation between two item fields of the same media item, such as a trim window. */
export type GenerationItemRequirement = {
  readonly kind: "strictlyIncreasing";
  readonly fields: readonly string[];
};

export type GenerationMediaPortKind = {
  readonly kind: "media";
  readonly accepts: readonly GenerationMediaRole[];
  readonly itemFields?: readonly GenerationPortItemField[];
  readonly itemRequires?: readonly GenerationItemRequirement[];
};

export type GenerationPortKind = GenerationPortScalarKind | GenerationMediaPortKind;

type GenerationPortBase = {
  readonly name: string;
  readonly minItems: number;
  readonly maxItems: number;
};

export type GenerationScalarPort = GenerationPortBase & { readonly value: GenerationPortScalarKind };
export type GenerationMediaPort = GenerationPortBase & { readonly value: GenerationMediaPortKind };

/**
 * One named input port. `minItems: 0` means the model works without it;
 * `maxItems: 1` means the port carries a single value rather than a list.
 */
export type GenerationPort = GenerationScalarPort | GenerationMediaPort;

export type GenerationPortRequirement =
  | { readonly kind: "atMostOneOf"; readonly ports: readonly string[] }
  | { readonly kind: "requiresPresent"; readonly port: string; readonly needs: readonly string[] }
  /** This port needs company, but any one of several will do — reference audio needs a visual. */
  | { readonly kind: "requiresAnyOf"; readonly port: string; readonly anyOf: readonly string[] }
  /** A shared budget several ports draw from, such as a total reference quota. */
  | {
      readonly kind: "weightedTotal";
      readonly weights: Readonly<Record<string, number>>;
      readonly maximum: number;
    };

export type GenerationPortTable = {
  /** Exact model identity; this is also the Capability name. */
  readonly model: string;
  readonly result: "audio" | "image" | "video";
  readonly ports: readonly GenerationPort[];
  readonly requires: readonly GenerationPortRequirement[];
};

export type GenerationMediaValue = {
  readonly role: GenerationMediaRole;
  readonly artifact: BlobRef;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
};

export type GenerationPortValue = string | number | boolean | GenerationMediaValue;

const PORT_NAME = /^[a-z][A-Za-z0-9]*$/u;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isMediaPort(port: GenerationPort): port is GenerationMediaPort {
  return port.value.kind === "media";
}

function assertScalarKind(value: GenerationPortScalarKind, subject: string): void {
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
  assert(value.kind === "boolean", `${subject} has an unsupported port kind`);
}

export function assertGenerationPortTable(value: GenerationPortTable): void {
  assert(typeof value.model === "string" && value.model.trim().length > 0, "Generation port table model is empty");
  assert(value.result === "audio" || value.result === "image" || value.result === "video",
    `${value.model} port table result is invalid`);
  assert(value.ports.length > 0, `${value.model} declares no input port`);

  const names = new Set<string>();
  for (const port of value.ports) {
    const subject = `${value.model} port ${port.name}`;
    assert(PORT_NAME.test(port.name), `${subject} name is invalid`);
    assert(!names.has(port.name), `${subject} is declared twice`);
    names.add(port.name);
    assert(Number.isSafeInteger(port.minItems) && port.minItems >= 0, `${subject} minItems is invalid`);
    assert(Number.isSafeInteger(port.maxItems) && port.maxItems >= Math.max(1, port.minItems),
      `${subject} maxItems is invalid`);
    if (isMediaPort(port)) {
      const media = port.value;
      assert(media.accepts.length > 0, `${subject} accepts no media role`);
      assert(new Set(media.accepts).size === media.accepts.length, `${subject} repeats a media role`);
      media.accepts.forEach((role) => assert(GENERATION_MEDIA_ROLES.includes(role), `${subject} media role ${role} is invalid`));
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
      assertScalarKind(port.value, subject);
    }
  }

  for (const requirement of value.requires) {
    if (requirement.kind === "atMostOneOf") {
      assert(requirement.ports.length >= 2, `${value.model} atMostOneOf needs at least two ports`);
      requirement.ports.forEach((name) => assert(names.has(name),
        `${value.model} atMostOneOf names unknown port ${name}`));
      assert(new Set(requirement.ports).size === requirement.ports.length,
        `${value.model} atMostOneOf repeats a port`);
      continue;
    }
    if (requirement.kind === "requiresAnyOf") {
      assert(names.has(requirement.port), `${value.model} requiresAnyOf names unknown port ${requirement.port}`);
      assert(requirement.anyOf.length >= 1, `${value.model} requiresAnyOf lists no companion port`);
      requirement.anyOf.forEach((name) => {
        assert(names.has(name), `${value.model} requiresAnyOf names unknown port ${name}`);
        assert(name !== requirement.port, `${value.model} requiresAnyOf ${name} depends on itself`);
      });
      continue;
    }
    if (requirement.kind === "weightedTotal") {
      const entries = Object.entries(requirement.weights);
      assert(entries.length >= 1, `${value.model} weightedTotal lists no port`);
      entries.forEach(([name, weight]) => {
        assert(names.has(name), `${value.model} weightedTotal names unknown port ${name}`);
        assert(Number.isFinite(weight) && weight > 0, `${value.model} weightedTotal weight for ${name} is invalid`);
      });
      assert(Number.isFinite(requirement.maximum) && requirement.maximum > 0,
        `${value.model} weightedTotal maximum is invalid`);
      continue;
    }
    assert(requirement.kind === "requiresPresent", `${value.model} declares an unsupported requirement`);
    assert(names.has(requirement.port), `${value.model} requiresPresent names unknown port ${requirement.port}`);
    assert(requirement.needs.length > 0, `${value.model} requiresPresent lists no prerequisite`);
    requirement.needs.forEach((name) => {
      assert(names.has(name), `${value.model} requiresPresent names unknown port ${name}`);
      assert(name !== requirement.port, `${value.model} requiresPresent ${name} depends on itself`);
    });
  }
}

export function sealGenerationPortTable(value: GenerationPortTable): GenerationPortTable {
  assertGenerationPortTable(value);
  return value;
}

export function generationPort(table: GenerationPortTable, name: string): GenerationPort {
  const port = table.ports.find((item) => item.name === name);
  if (port === undefined) throw new Error(`${table.model} declares no port ${name}`);
  return port;
}
