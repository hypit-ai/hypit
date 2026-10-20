import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef } from "@hypit/hypit/protocol";

import { isMediaPort } from "./ports.js";
import type { GenerationMediaValue, GenerationPortTable } from "./ports.js";
import { presentPorts } from "./request.js";
import type { GenerationRequest } from "./request.js";

/** Per-reference fields consumed by the service's resource transport rather than its generation body. */
export type GenerationArtifactUrlResolver = (
  artifact: BlobRef,
  fields?: Readonly<Record<string, string | number | boolean>>,
) => Promise<string>;

/**
 * How one service names the fields of one model's declared input ports.
 *
 * A mapping is optional Provider-local data over one already validated Model
 * request. The Provider may depend one-way on that Model's public contract;
 * this helper owns only service field names and transport projection, never the
 * Model request semantics.
 */
export type GenerationFieldMapping =
  /** One scalar written as-is. */
  | { readonly as: "value"; readonly field: string }
  /** One scalar coerced to its string form, for services that type it loosely. */
  | { readonly as: "string"; readonly field: string }
  /** Several scalars written as one array. */
  | { readonly as: "valueArray"; readonly field: string }
  /** One media item written as a resolved URL. */
  | { readonly as: "url"; readonly field: string; readonly resourceFields?: readonly string[] }
  /** Several media items written as one array of resolved URLs. */
  | { readonly as: "urlArray"; readonly field: string; readonly resourceFields?: readonly string[] }
  /** Media items written as objects carrying the resolved URL and their item fields. */
  | {
      readonly as: "itemObject";
      readonly field: string;
      readonly urlKey: string;
      readonly resourceFields?: readonly string[];
      readonly fieldKeys: Readonly<Record<string, string>>;
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
  readonly routes: readonly GenerationWireRoute[];
  readonly fields: Readonly<Record<string, GenerationFieldMapping>>;
  readonly constants?: Readonly<Record<string, CanonicalValue>>;
};

export type GenerationWireRequest = {
  readonly model: string;
  readonly input: CanonicalValue;
};

export type GenerationWireResource = {
  readonly kind: "generation-resource";
  readonly artifact: BlobRef;
  readonly fields: Readonly<Record<string, string | number | boolean>>;
};

export type GenerationWireValuePlan =
  | CanonicalValue
  | GenerationWireResource
  | readonly GenerationWireValuePlan[]
  | { readonly [key: string]: GenerationWireValuePlan };

/** Pure Provider projection. Resources remain explicit until a transport is chosen. */
export type GenerationWirePlan = {
  readonly model: string;
  readonly input: Readonly<Record<string, GenerationWireValuePlan>>;
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

/** Select one service model from the concrete request emitted by its Producer. */
export function selectWireModelForRequest(
  mapping: GenerationWireMapping,
  request: GenerationRequest,
): string {
  const unsupported = unsupportedRequestField(mapping, request);
  assert(unsupported === undefined,
    `${mapping.capability.name} request contains ${unsupported} this Provider cannot map`);
  const present = new Set(presentPorts(request));
  return selectWireModel(mapping, present);
}

function resourceFields(item: GenerationMediaValue, names: readonly string[] = []) {
  return Object.fromEntries(names.filter((name) => item.fields?.[name] !== undefined)
    .map((name) => [name, item.fields![name]!]));
}

/**
 * Compile one port-shaped request into one service payload. The engine needs
 * only the mapping and the request, never the model package.
 */
export function planWireRequest(
  mapping: GenerationWireMapping,
  request: GenerationRequest,
): GenerationWirePlan {
  const model = selectWireModelForRequest(mapping, request);
  const input: Record<string, GenerationWireValuePlan> = { ...(mapping.constants ?? {}) };

  for (const [port, field] of Object.entries(mapping.fields)) {
    const supplied = request.ports[port];
    if (supplied === undefined) continue;
    if (field.as === "value") {
      input[field.field] = supplied[0] as CanonicalValue;
    } else if (field.as === "string") {
      input[field.field] = String(supplied[0]);
    } else if (field.as === "valueArray") {
      input[field.field] = supplied as readonly CanonicalValue[];
    } else if (field.as === "url") {
      const item = supplied[0] as GenerationMediaValue;
      input[field.field] = {
        kind: "generation-resource",
        artifact: item.artifact,
        fields: resourceFields(item, field.resourceFields),
      };
    } else if (field.as === "urlArray") {
      input[field.field] = (supplied as readonly GenerationMediaValue[]).map((item) => ({
        kind: "generation-resource" as const,
        artifact: item.artifact,
        fields: resourceFields(item, field.resourceFields),
      }));
    } else {
      const media = supplied as readonly GenerationMediaValue[];
      input[field.field] = media.map((item) => ({
        [field.urlKey]: {
          kind: "generation-resource" as const,
          artifact: item.artifact,
          fields: resourceFields(item, field.resourceFields),
        },
        ...Object.fromEntries(Object.entries(field.fieldKeys)
          .filter(([source]) => item.fields?.[source] !== undefined)
          .map(([source, target]) => [target, item.fields![source] as CanonicalValue])),
      }));
    }
  }

  return { model, input };
}

function isWireResource(value: GenerationWireValuePlan): value is GenerationWireResource {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as { readonly kind?: unknown }).kind === "generation-resource";
}

async function materializeWireValue(
  value: GenerationWireValuePlan,
  resolve: GenerationArtifactUrlResolver,
): Promise<CanonicalValue> {
  if (isWireResource(value)) return await resolve(value.artifact, value.fields);
  if (Array.isArray(value)) return await Promise.all(value.map(async (item) => await materializeWireValue(item, resolve)));
  if (value !== null && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value)
      .map(async ([key, item]) => [key, await materializeWireValue(item, resolve)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

/** Effect boundary for the URL-based transport used by the current HTTP Providers. */
export async function materializeWireRequest(
  plan: GenerationWirePlan,
  resolve: GenerationArtifactUrlResolver,
): Promise<GenerationWireRequest> {
  return {
    model: plan.model,
    input: canonicalize(await materializeWireValue(plan.input, resolve)),
  };
}

/** Describe only a supplied value the mapping cannot carry; no model table or saved verdict. */
function unsupportedRequestField(mapping: GenerationWireMapping, value: unknown): string | undefined {
  const request = value as GenerationRequest | undefined;
  if (request === undefined || request === null || request.ports === null || typeof request.ports !== "object") {
    return "invalid ports";
  }
  for (const [port, supplied] of Object.entries(request.ports)) {
    const field = mapping.fields[port];
    if (field === undefined) return `port ${port}`;
    if (field.as !== "url" && field.as !== "urlArray" && field.as !== "itemObject") continue;
    for (const item of supplied as readonly GenerationMediaValue[]) {
      for (const name of Object.keys(item.fields ?? {})) {
        if (!field.resourceFields?.includes(name)
          && !(field.as === "itemObject" && Object.hasOwn(field.fieldKeys, name))) {
          return `field ${port}.${name}`;
        }
      }
    }
  }
  return undefined;
}

/** Optional fields may be omitted by authors, but supplied fields must reach the service. */
export function mappingSupportsRequest(mapping: GenerationWireMapping, value: unknown): boolean {
  return unsupportedRequestField(mapping, value) === undefined;
}

/**
 * Check structural port coverage and required item fields against the model declaration.
 *
 * A service may omit optional item capabilities. mappingSupportsRequest and final compilation
 * additionally refuse requests that actually supply such an unmapped field.
 */
export function assertMappingCoversPorts(
  table: GenerationPortTable,
  mapping: GenerationWireMapping,
): void {
  assert(mapping.capability.name === table.model,
    `mapping names Capability ${mapping.capability.name} but the port table declares ${table.model}`);
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
      assert(itemFields.length > 0 || media.accepts.length === 1,
        `${subject} accepts ${media.accepts.join(", ")}; declare one port per media role so each maps to one wire field`);
      assert(field.as === "url" || field.as === "urlArray" || field.as === "itemObject",
        `${subject} must resolve media to a URL`);
      if (field.as === "url") {
        assert(port.maxItems === 1, `${subject} uses url but the port is not a single value`);
      }
      const mappedFields = [
        ...(field.resourceFields ?? []),
        ...(field.as === "itemObject" ? Object.keys(field.fieldKeys) : []),
      ];
      for (const item of itemFields) {
        if (item.optional !== true) assert(mappedFields.includes(item.name),
          `${subject} does not map required item field ${item.name}`);
      }
      for (const name of mappedFields) assert(itemFields.some((item) => item.name === name),
        `${subject} maps unknown item field ${name}`);
      continue;
    }
    if (port.maxItems === undefined || port.maxItems > 1) {
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
