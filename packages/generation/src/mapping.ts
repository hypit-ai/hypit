import { canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, CapabilityRef } from "@hypit/hypit/protocol";

import { isArtifactField } from "./fields.js";
import type { ModelArtifactValue, ModelFieldTable } from "./fields.js";
import { presentModelFields } from "./request.js";
import type { ModelFieldRequest } from "./request.js";

/** Per-reference fields consumed by the service's resource transport rather than its generation body. */
export type GenerationArtifactUrlResolver = (
  artifact: BlobRef,
  fields?: Readonly<Record<string, string | number | boolean>>,
) => Promise<string>;

/**
 * How one service names the fields of one Model's declared input fields.
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
   * here keeps a field change visible: a mapping written for one Model version
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
  throw new Error(`${mapping.capability.name} has no route for fields ${[...present].sort().join(", ")}`);
}

/** Select one service model from the concrete request emitted by its Producer. */
export function selectWireModelForRequest(
  mapping: GenerationWireMapping,
  request: ModelFieldRequest,
): string {
  const unsupported = unsupportedRequestField(mapping, request);
  assert(unsupported === undefined,
    `${mapping.capability.name} request contains ${unsupported} this Provider cannot map`);
  const present = new Set(presentModelFields(request));
  return selectWireModel(mapping, present);
}

function resourceFields(item: ModelArtifactValue, names: readonly string[] = []) {
  return Object.fromEntries(names.filter((name) => item.fields?.[name] !== undefined)
    .map((name) => [name, item.fields![name]!]));
}

/**
 * Compile one field-shaped request into one service payload. The engine needs
 * only the mapping and the request, never the model package.
 */
export function planWireRequest(
  mapping: GenerationWireMapping,
  request: ModelFieldRequest,
): GenerationWirePlan {
  const model = selectWireModelForRequest(mapping, request);
  const input: Record<string, GenerationWireValuePlan> = { ...(mapping.constants ?? {}) };

  for (const [name, field] of Object.entries(mapping.fields)) {
    const supplied = request.fields[name];
    if (supplied === undefined) continue;
    if (field.as === "value") {
      input[field.field] = supplied[0] as CanonicalValue;
    } else if (field.as === "string") {
      input[field.field] = String(supplied[0]);
    } else if (field.as === "valueArray") {
      input[field.field] = supplied as readonly CanonicalValue[];
    } else if (field.as === "url") {
      const item = supplied[0] as ModelArtifactValue;
      input[field.field] = {
        kind: "generation-resource",
        artifact: item.artifact,
        fields: resourceFields(item, field.resourceFields),
      };
    } else if (field.as === "urlArray") {
      input[field.field] = (supplied as readonly ModelArtifactValue[]).map((item) => ({
        kind: "generation-resource" as const,
        artifact: item.artifact,
        fields: resourceFields(item, field.resourceFields),
      }));
    } else {
      const media = supplied as readonly ModelArtifactValue[];
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
  const request = value as ModelFieldRequest | undefined;
  if (request === undefined || request === null || request.fields === null || typeof request.fields !== "object") {
    return "invalid fields";
  }
  for (const [fieldName, supplied] of Object.entries(request.fields)) {
    const field = mapping.fields[fieldName];
    if (field === undefined) return `field ${fieldName}`;
    if (field.as !== "url" && field.as !== "urlArray" && field.as !== "itemObject") continue;
    for (const item of supplied as readonly ModelArtifactValue[]) {
      for (const name of Object.keys(item.fields ?? {})) {
        if (!field.resourceFields?.includes(name)
          && !(field.as === "itemObject" && Object.hasOwn(field.fieldKeys, name))) {
          return `field ${fieldName}.${name}`;
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
 * Check structural field coverage and required item fields against the model declaration.
 *
 * A service may omit optional item capabilities. mappingSupportsRequest and final compilation
 * additionally refuse requests that actually supply such an unmapped field.
 */
export function assertMappingCoversFields(
  table: ModelFieldTable,
  mapping: GenerationWireMapping,
): void {
  assert(mapping.capability.name === table.model,
    `mapping names Capability ${mapping.capability.name} but the field table declares ${table.model}`);
  const declared = new Map(table.fields.map((field) => [field.name, field]));
  Object.keys(mapping.fields).forEach((name) => assert(declared.has(name),
    `${table.model} mapping names undeclared field ${name}`));

  for (const modelField of table.fields) {
    const field = mapping.fields[modelField.name];
    assert(field !== undefined, `${table.model} mapping does not cover field ${modelField.name}`);
    const subject = `${table.model} mapping for field ${modelField.name}`;
    if (isArtifactField(modelField)) {
      const media = modelField.value;
      const itemFields = media.itemFields ?? [];
      assert(itemFields.length > 0 || media.accepts.length === 1,
        `${subject} accepts ${media.accepts.join(", ")}; declare one field per media role so each maps to one wire field`);
      assert(field.as === "url" || field.as === "urlArray" || field.as === "itemObject",
        `${subject} must resolve media to a URL`);
      if (field.as === "url") {
        assert(modelField.maxItems === 1, `${subject} uses url but the field is not a single value`);
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
    if (modelField.maxItems === undefined || modelField.maxItems > 1) {
      assert(field.as === "valueArray", `${subject} must use valueArray because the field accepts several values`);
      continue;
    }
    // A single-value field may still be written as a wire array when the service types it that way.
    assert(field.as === "value" || field.as === "string" || field.as === "valueArray",
      `${subject} must write a scalar or a single-element array`);
  }

  const emitted = Object.values(mapping.fields).map((field) => field.field);
  assert(new Set(emitted).size === emitted.length,
    `${table.model} mapping writes one wire field from two model fields`);
  Object.keys(mapping.constants ?? {}).forEach((name) => assert(!emitted.includes(name),
    `${table.model} mapping constant ${name} collides with a mapped field`));

  assert(mapping.routes.length > 0, `${table.model} mapping declares no route`);
  mapping.routes.forEach((route, index) => {
    assert(route.model.trim().length > 0, `${table.model} route ${index} has an empty service model`);
    (route.whenPresent ?? []).forEach((name) => assert(declared.has(name),
      `${table.model} route ${index} names undeclared field ${name}`));
    const unconditional = route.whenPresent === undefined || route.whenPresent.length === 0;
    assert(unconditional === (index === mapping.routes.length - 1),
      `${table.model} must end with exactly one unconditional route`);
  });
}
