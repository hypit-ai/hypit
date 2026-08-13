import { canonicalize } from "@narratage/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef } from "@narratage/protocol";

import { isMediaPort } from "./ports.js";
import type { GenerationMediaRole, GenerationMediaValue, GenerationPortTable } from "./ports.js";
import { presentPorts } from "./request.js";
import type { GenerationRequest } from "./request.js";

/**
 * How one service names the fields of one model's declared input ports.
 *
 * A mapping is data, not code, and it references its Capability by name. A
 * Provider package therefore never imports a model package: the model owns what
 * it eats, the service owns what it calls that on the wire.
 */
export type GenerationArtifactUrlResolver = (artifact: BlobRef) => Promise<string>;

export type GenerationFieldMapping =
  /** One scalar written as-is. */
  | { readonly as: "value"; readonly field: string; readonly whenAbsent?: CanonicalValue }
  /** One scalar coerced to its string form, for services that type it loosely. */
  | { readonly as: "string"; readonly field: string; readonly whenAbsent?: CanonicalValue }
  /** Several scalars written as one array. */
  | { readonly as: "valueArray"; readonly field: string; readonly whenAbsent?: CanonicalValue }
  /** One media item written as a resolved URL. */
  | { readonly as: "url"; readonly field: string; readonly whenAbsent?: CanonicalValue }
  /** Several media items written as one array of resolved URLs. */
  | { readonly as: "urlArray"; readonly field: string; readonly whenAbsent?: CanonicalValue }
  /** Media items written as objects carrying the resolved URL and their item fields. */
  | {
      readonly as: "itemObject";
      readonly field: string;
      readonly urlKey: string;
      readonly fieldKeys: Readonly<Record<string, string>>;
      readonly whenAbsent?: CanonicalValue;
    };

/** Selects the service-side model identifier. The first matching route wins. */
export type GenerationWireRoute = {
  readonly model: string;
  readonly whenPresent?: readonly string[];
};

export type GenerationWireMapping = {
  /**
   * The exact Capability implemented, named as data. Binding the module version
   * here keeps a port change visible: a mapping written for one model version
   * cannot silently serve another.
   */
  readonly capability: CapabilityRef;
  readonly result: "audio" | "image" | "video";
  readonly routes: readonly GenerationWireRoute[];
  readonly fields: Readonly<Record<string, GenerationFieldMapping>>;
  readonly constants?: Readonly<Record<string, CanonicalValue>>;
};

export type GenerationWireRequest = {
  readonly model: string;
  readonly input: CanonicalValue;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function selectWireModel(mapping: GenerationWireMapping, present: ReadonlySet<string>): string {
  for (const route of mapping.routes) {
    if (route.whenPresent === undefined || route.whenPresent.every((name) => present.has(name))) {
      return route.model;
    }
  }
  throw new Error(`${mapping.capability.name} has no route for ports ${[...present].sort().join(", ")}`);
}

async function urlsOf(
  values: readonly GenerationMediaValue[],
  resolve: GenerationArtifactUrlResolver,
): Promise<string[]> {
  return await Promise.all(values.map((item) => resolve(item.artifact)));
}

/**
 * Compile one port-shaped request into one service payload. The engine needs
 * only the mapping and the request, never the model package.
 */
export async function compileWireRequest(
  mapping: GenerationWireMapping,
  request: GenerationRequest,
  resolve: GenerationArtifactUrlResolver,
): Promise<GenerationWireRequest> {
  assert(mappingSupportsRequest(mapping, request),
    `${mapping.capability.name} request contains a port this Provider cannot map`);
  const present = presentPorts(request);
  const input: Record<string, CanonicalValue> = { ...(mapping.constants ?? {}) };

  for (const [port, field] of Object.entries(mapping.fields)) {
    const supplied = request.ports[port];
    if (supplied === undefined) {
      if (field.whenAbsent !== undefined) input[field.field] = field.whenAbsent;
      continue;
    }
    if (field.as === "value") {
      input[field.field] = supplied[0] as CanonicalValue;
    } else if (field.as === "string") {
      input[field.field] = String(supplied[0]);
    } else if (field.as === "valueArray") {
      input[field.field] = supplied as readonly CanonicalValue[];
    } else if (field.as === "url") {
      input[field.field] = await resolve((supplied[0] as GenerationMediaValue).artifact);
    } else if (field.as === "urlArray") {
      input[field.field] = await urlsOf(supplied as readonly GenerationMediaValue[], resolve);
    } else {
      const media = supplied as readonly GenerationMediaValue[];
      input[field.field] = await Promise.all(media.map(async (item) => ({
        [field.urlKey]: await resolve(item.artifact),
        ...Object.fromEntries(Object.entries(field.fieldKeys)
          .filter(([source]) => item.fields?.[source] !== undefined)
          .map(([source, target]) => [target, item.fields![source] as CanonicalValue])),
      })));
    }
  }

  return { model: selectWireModel(mapping, present), input: canonicalize(input) };
}

/** Does this request only use ports this mapping can write? Needs no model package. */
export function mappingSupportsRequest(mapping: GenerationWireMapping, value: unknown): boolean {
  const request = value as GenerationRequest | undefined;
  if (request === undefined || request.ports === null || typeof request.ports !== "object") return false;
  return Object.keys(request.ports).every((port) => mapping.fields[port] !== undefined);
}

/**
 * Prove one service mapping covers every port the model declares.
 *
 * This is the check the old hand-written per-model translators could not have:
 * a forgotten reference role or item field used to surface only after a paid
 * generation returned the wrong result.
 */
export function assertMappingCoversPorts(
  table: GenerationPortTable,
  mapping: GenerationWireMapping,
): void {
  assert(mapping.capability.name === table.model,
    `mapping names Capability ${mapping.capability.name} but the port table declares ${table.model}`);
  assert(mapping.result === table.result,
    `${table.model} mapping result ${mapping.result} differs from the port table`);

  const declared = new Map(table.ports.map((port) => [port.name, port]));
  Object.keys(mapping.fields).forEach((name) => assert(declared.has(name),
    `${table.model} mapping names undeclared port ${name}`));

  for (const port of table.ports) {
    const field = mapping.fields[port.name];
    assert(field !== undefined, `${table.model} mapping does not cover port ${port.name}`);
    const subject = `${table.model} mapping for port ${port.name}`;
    if (isMediaPort(port)) {
      const media = port.value;
      const itemFields = media.itemFields ?? [];
      if (itemFields.length > 0) {
        assert(field.as === "itemObject", `${subject} must use itemObject because the port carries item fields`);
        for (const item of itemFields) {
          if (item.optional === true) continue;
          assert(field.fieldKeys[item.name] !== undefined,
            `${subject} does not map required item field ${item.name}`);
        }
        Object.keys(field.fieldKeys).forEach((name) => assert(
          itemFields.some((item) => item.name === name),
          `${subject} maps unknown item field ${name}`,
        ));
        continue;
      }
      assert(media.accepts.length === 1,
        `${subject} accepts ${media.accepts.join(", ")}; declare one port per media role so each maps to one wire field`);
      assert(field.as === "url" || field.as === "urlArray", `${subject} must resolve media to a URL`);
      if (field.as === "url") {
        assert(port.maxItems === 1, `${subject} uses url but the port accepts up to ${port.maxItems} items`);
      }
      continue;
    }
    if (port.maxItems > 1) {
      assert(field.as === "valueArray", `${subject} must use valueArray because the port accepts several values`);
      continue;
    }
    // A single-value port may still be written as a wire array when the service types it that way.
    assert(field.as === "value" || field.as === "string" || field.as === "valueArray",
      `${subject} must write a scalar or a single-element array`);
  }

  const emitted = Object.values(mapping.fields).map((field) => field.field);
  assert(new Set(emitted).size === emitted.length,
    `${table.model} mapping writes one wire field from two ports`);
  Object.keys(mapping.constants ?? {}).forEach((name) => assert(!emitted.includes(name),
    `${table.model} mapping constant ${name} collides with a mapped port`));

  assert(mapping.routes.length > 0, `${table.model} mapping declares no route`);
  mapping.routes.forEach((route, index) => {
    assert(route.model.trim().length > 0, `${table.model} route ${index} has an empty service model`);
    (route.whenPresent ?? []).forEach((name) => assert(declared.has(name),
      `${table.model} route ${index} names undeclared port ${name}`));
    const unconditional = route.whenPresent === undefined || route.whenPresent.length === 0;
    assert(unconditional === (index === mapping.routes.length - 1),
      `${table.model} must end with exactly one unconditional route`);
  });
}
