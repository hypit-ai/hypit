import type { CanonicalValue, TypeRef } from "@hypit/protocol";

import type { GenerationComponentRef, GenerationGraphNode } from "./types.js";

/** Media meaning carried by one authored graph edge. It is independent from Canvas styling. */
export type GenerationAuthoringMediaRole = "image" | "video" | "audio";

export type GenerationAuthoringScalar =
  | { readonly kind: "text"; readonly maxChars?: number }
  | { readonly kind: "enum"; readonly values: readonly (string | number)[] }
  | { readonly kind: "number"; readonly integer?: boolean; readonly minimum?: number; readonly maximum?: number }
  | { readonly kind: "boolean" };

export type GenerationAuthoringItemField = {
  readonly name: string;
  readonly input: { readonly kind: "sibling"; readonly name: string } | { readonly kind: "suffix" };
  readonly value: GenerationAuthoringScalar;
  readonly optional?: boolean;
  readonly default?: string | number | boolean;
};

export type GenerationAuthoringControl = {
  readonly id: string;
  /** Exact Graph input containing the authored literal. */
  readonly input: string;
  readonly value: GenerationAuthoringScalar;
  readonly required: boolean;
  readonly default?: CanonicalValue;
};

export type GenerationAuthoringMediaSlot = {
  readonly id: string;
  readonly kind: "slot";
  readonly input: string;
  readonly accepts: readonly GenerationAuthoringMediaRole[];
  readonly required: boolean;
  readonly itemFields?: readonly GenerationAuthoringItemField[];
};

export type GenerationAuthoringMediaListEntry = {
  readonly role: GenerationAuthoringMediaRole;
  /** Graph input prefix used for this role. Roles may share one prefix when role is explicit. */
  readonly prefix: string;
  readonly itemFields?: readonly GenerationAuthoringItemField[];
  /** This role may be present only when at least one listed role is also present in the list. */
  readonly requiresAnyRole?: readonly GenerationAuthoringMediaRole[];
};

export type GenerationAuthoringMediaList = {
  readonly id: string;
  readonly kind: "list";
  readonly entries: readonly GenerationAuthoringMediaListEntry[];
  readonly minItems: number;
  readonly maxItems?: number;
};

export type GenerationAuthoringPort = GenerationAuthoringMediaSlot | GenerationAuthoringMediaList;

export type GenerationAuthoringVariant = {
  readonly value: string;
  /** Control and port ids active in this exact authored variant. */
  readonly active: readonly string[];
  /** At least one named port must contain a binding before this variant is complete. */
  readonly requiresOneOf?: readonly string[];
};

export type GenerationAuthoringVariantSelector = {
  readonly input: string;
  readonly default: string;
  readonly variants: readonly GenerationAuthoringVariant[];
};

export type GenerationAuthoringRule =
  | { readonly kind: "atMostOneOf"; readonly fields: readonly string[] }
  | { readonly kind: "atLeastOneOf"; readonly fields: readonly string[] }
  | { readonly kind: "requiresPresent"; readonly field: string; readonly needs: readonly string[] }
  | { readonly kind: "requiresAnyOf"; readonly field: string; readonly anyOf: readonly string[] }
  | { readonly kind: "weightedTotal"; readonly weights: Readonly<Record<string, number>>; readonly maximum: number };

/**
 * Package-owned editable shape of one exact Generation component. It describes Graph authoring,
 * not Provider requests and not Canvas markup. The same declaration is available to every host.
 */
export type GenerationNodeAuthoringShape = {
  readonly using: GenerationComponentRef;
  readonly output: {
    readonly type: TypeRef;
    readonly connectable: boolean;
    readonly media?: readonly GenerationAuthoringMediaRole[];
  };
  readonly controls: readonly GenerationAuthoringControl[];
  readonly ports: readonly GenerationAuthoringPort[];
  readonly variant?: GenerationAuthoringVariantSelector;
  readonly rules?: readonly GenerationAuthoringRule[];
};

export type GenerationNodeAuthoringHost = {
  readonly resolveAuthoring: (node: GenerationGraphNode) => GenerationNodeAuthoringShape | undefined;
  readonly listAuthoring: () => readonly GenerationNodeAuthoringShape[];
};

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u;
const roles = new Set<GenerationAuthoringMediaRole>(["image", "video", "audio"]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function scalar(value: GenerationAuthoringScalar, subject: string): void {
  if (value.kind === "text") {
    if (value.maxChars !== undefined) assert(Number.isSafeInteger(value.maxChars) && value.maxChars > 0,
      `${subject} maxChars is invalid.`);
    return;
  }
  if (value.kind === "enum") {
    assert(value.values.length > 0 && new Set(value.values).size === value.values.length,
      `${subject} enum is invalid.`);
    return;
  }
  if (value.kind === "number") {
    if (value.minimum !== undefined && value.maximum !== undefined) {
      assert(value.minimum <= value.maximum, `${subject} numeric bounds are inverted.`);
    }
    return;
  }
  assert(value.kind === "boolean", `${subject} scalar kind is invalid.`);
}

export function assertGenerationNodeAuthoringShape(shape: GenerationNodeAuthoringShape): void {
  assert(shape !== null && typeof shape === "object" && !Array.isArray(shape),
    "Generation Node authoring shape must be an object.");
  assert(shape.output !== null && typeof shape.output === "object" && typeof shape.output.connectable === "boolean",
    "Generation Node authoring output is invalid.");
  if (shape.output.media !== undefined) {
    assert(shape.output.media.length > 0 && shape.output.media.every((role) => roles.has(role)),
      "Generation Node authoring output media roles are invalid.");
  }
  const ids = new Set<string>();
  for (const control of shape.controls) {
    assert(IDENTIFIER.test(control.id) && IDENTIFIER.test(control.input), "Generation authoring control identity is invalid.");
    assert(!ids.has(control.id), `Generation authoring repeats ${control.id}.`);
    ids.add(control.id);
    scalar(control.value, `Generation authoring control ${control.id}`);
  }
  for (const port of shape.ports) {
    assert(IDENTIFIER.test(port.id), "Generation authoring port identity is invalid.");
    assert(!ids.has(port.id), `Generation authoring repeats ${port.id}.`);
    ids.add(port.id);
    if (port.kind === "slot") {
      assert(port.accepts.length > 0 && port.accepts.every((role) => roles.has(role)),
        `Generation authoring slot ${port.id} accepts invalid media.`);
      assert(IDENTIFIER.test(port.input), `Generation authoring port ${port.id} input is invalid.`);
      for (const field of port.itemFields ?? []) {
        assert(IDENTIFIER.test(field.name), `Generation authoring port ${port.id} item field is invalid.`);
        if (field.input.kind === "sibling") assert(IDENTIFIER.test(field.input.name),
          `Generation authoring port ${port.id} sibling item input is invalid.`);
        scalar(field.value, `Generation authoring port ${port.id} item field ${field.name}`);
      }
    } else {
      assert(Number.isSafeInteger(port.minItems) && port.minItems >= 0,
        `Generation authoring list ${port.id} minItems is invalid.`);
      if (port.maxItems !== undefined) assert(Number.isSafeInteger(port.maxItems) && port.maxItems >= Math.max(1, port.minItems),
        `Generation authoring list ${port.id} maxItems is invalid.`);
      assert(port.entries.length > 0 && port.entries.every((entry) => roles.has(entry.role)),
        `Generation authoring list ${port.id} entries are invalid.`);
      assert(new Set(port.entries.map((entry) => entry.role)).size === port.entries.length,
        `Generation authoring list ${port.id} repeats a media role.`);
      for (const entry of port.entries) {
        assert(entry.requiresAnyRole?.every((role) => roles.has(role)) ?? true,
          `Generation authoring list ${port.id} role dependency is invalid.`);
        assert(IDENTIFIER.test(entry.prefix), `Generation authoring port ${port.id} input is invalid.`);
        for (const field of entry.itemFields ?? []) {
          assert(IDENTIFIER.test(field.name), `Generation authoring port ${port.id} item field is invalid.`);
          if (field.input.kind === "sibling") assert(IDENTIFIER.test(field.input.name),
            `Generation authoring port ${port.id} sibling item input is invalid.`);
          scalar(field.value, `Generation authoring port ${port.id} item field ${field.name}`);
        }
      }
    }
  }
  if (shape.variant !== undefined) {
    assert(IDENTIFIER.test(shape.variant.input), "Generation authoring variant input is invalid.");
    assert(shape.variant.variants.length > 0, "Generation authoring variant has no choices.");
    const values = new Set(shape.variant.variants.map((item) => item.value));
    assert(values.size === shape.variant.variants.length && values.has(shape.variant.default),
      "Generation authoring variant choices are invalid.");
    for (const variant of shape.variant.variants) {
      variant.active.forEach((id) => assert(ids.has(id), `Generation authoring variant names unknown field ${id}.`));
      variant.requiresOneOf?.forEach((id) => assert(ids.has(id),
        `Generation authoring variant names unknown required port ${id}.`));
    }
  }
}
