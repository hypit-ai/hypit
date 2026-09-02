import { canonicalize } from "@hypit/protocol";
import type { BlobRef, ObjectFieldSchema, ValueSchema } from "@hypit/protocol";
import { verifyText } from "@hypit/text";
import type { Text } from "@hypit/text";

import { assertGenerationBlobRef, sealGenerationRequest } from "./identity.js";
import { generationBlobRefSchema, generationObjectSchema } from "./schema.js";
import { assertGenerationPortTable, isMediaPort } from "./ports.js";
import type {
  GenerationMediaPort,
  GenerationMediaRole,
  GenerationPort,
  GenerationPortItemField,
  GenerationPortScalarKind,
  GenerationPortTable,
  GenerationPortValue,
} from "./ports.js";

/**
 * The one request envelope every exact model uses. A Provider reads ports by
 * name and never learns a model-specific field layout, so the same wire mapping
 * mechanism serves every model and every service reselling it.
 */
export type GenerationRequest = {
  /** An absent port is an omitted key. A present port always carries at least one value. */
  readonly ports: Readonly<Record<string, readonly GenerationPortValue[]>>;
};

/**
 * A request while graph inputs are still being attached. It is deliberately a
 * Providers can only receive the finalized request after the exact model
 * package has checked every port rule.
 */
export type GenerationRequestDraft = {
  readonly ports: Readonly<Record<string, readonly GenerationPortValue[]>>;
};

/** Authored instructions for attaching one graph Blob edge to one media port. */
export type GenerationMediaBinding = {
  readonly role: GenerationMediaRole;
  readonly fields?: Readonly<Record<string, string | number | boolean>>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function plainObject(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function mediaPrefix(role: GenerationMediaRole): "image/" | "video/" | "audio/" {
  return `${role}/` as "image/" | "video/" | "audio/";
}

function scalarSchema(value: GenerationPortScalarKind): ValueSchema {
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

function itemFieldsSchema(fields: readonly GenerationPortItemField[]): ValueSchema {
  return generationObjectSchema(Object.fromEntries(fields.map((field) => [field.name, {
    schema: scalarSchema(field.value),
    ...(field.optional === true ? { optional: true } : {}),
  } satisfies ObjectFieldSchema])));
}

/** Schema for the non-artifact half of one media-port attachment. */
export function mediaBindingSchemaFromPort(port: GenerationMediaPort): ValueSchema {
  const fields = port.value.itemFields ?? [];
  return generationObjectSchema({
    role: { schema: { kind: "string", enum: [...port.value.accepts] } },
    ...(fields.length === 0 ? {} : { fields: { schema: itemFieldsSchema(fields) } }),
  });
}

function portItemSchema(port: GenerationPort): ValueSchema {
  if (!isMediaPort(port)) return scalarSchema(port.value);
  const media = port.value;
  return generationObjectSchema({
    role: { schema: { kind: "string", enum: [...media.accepts] } },
    artifact: { schema: generationBlobRefSchema },
    ...(media.itemFields === undefined || media.itemFields.length === 0
      ? {}
      : { fields: { schema: itemFieldsSchema(media.itemFields) } }),
  });
}

export type GenerationPortSubset = {
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

/** Derive the Schema of the port map alone, optionally leaving some ports for later. */
export function portsObjectSchema(
  table: GenerationPortTable,
  options: GenerationPortSubset = {},
): ValueSchema {
  assertGenerationPortTable(table);
  const omit = new Set(options.omit ?? []);
  const defer = new Set(options.defer ?? []);
  omit.forEach((name) => assert(table.ports.some((port) => port.name === name),
    `${table.model} cannot omit undeclared port ${name}`));
  defer.forEach((name) => {
    assert(table.ports.some((port) => port.name === name), `${table.model} cannot defer undeclared port ${name}`);
    assert(!omit.has(name), `${table.model} cannot both omit and defer port ${name}`);
  });
  return generationObjectSchema(Object.fromEntries(table.ports
    .filter((port) => !omit.has(port.name))
    .map((port) => [port.name, {
      schema: {
        kind: "array",
        items: portItemSchema(port),
        minItems: Math.max(1, port.minItems),
        maxItems: port.maxItems,
      },
      ...(port.minItems === 0 || defer.has(port.name) ? { optional: true } : {}),
    } satisfies ObjectFieldSchema])));
}

/** Derive the structural Schema of one model's request from its port table. */
export function requestSchemaFromPorts(table: GenerationPortTable): ValueSchema {
  return generationObjectSchema({
    ports: { schema: portsObjectSchema(table) },
  });
}

/** Structural schema for the model-owned request draft used by graph assembly. */
export function requestDraftSchemaFromPorts(table: GenerationPortTable): ValueSchema {
  const deferred = table.ports
    .filter((port) => isMediaPort(port) || port.value.kind === "text")
    .map((port) => port.name);
  return generationObjectSchema({
    ports: { schema: portsObjectSchema(table, { defer: deferred }) },
  });
}

function verifyScalar(value: unknown, kind: GenerationPortScalarKind, subject: string): void {
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

function verifyMediaItemFields(value: Record<string, unknown>, port: GenerationMediaPort, subject: string): void {
  const media = port.value;
  const role = value.role;
  assert(typeof role === "string" && media.accepts.includes(role as GenerationMediaRole),
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

function verifyMediaValue(value: unknown, port: GenerationMediaPort, subject: string): void {
  const item = plainObject(value, subject);
  verifyMediaItemFields(item, port, subject);
  assertGenerationBlobRef(item.artifact, mediaPrefix(item.role as GenerationMediaRole));
}

/**
 * Full standalone verification against the port table. Core's generic schema
 * admission runs first; this adds the facts a Schema cannot state, such as the
 * media type each role demands and the model's port combination rules.
 */
export function verifyPortsAgainstTable(
  table: GenerationPortTable,
  value: unknown,
  options: GenerationPortSubset = {},
): void {
  assertGenerationPortTable(table);
  const omit = new Set(options.omit ?? []);
  const defer = new Set(options.defer ?? []);
  const ports = plainObject(value, `${table.model} ports`);
  const declared = new Map(table.ports.map((port) => [port.name, port]));
  Object.keys(ports).forEach((name) => {
    assert(declared.has(name), `${table.model} names undeclared port ${name}`);
    assert(!omit.has(name), `${table.model} port ${name} is supplied later and must be absent here`);
  });

  const present = new Set<string>();
  for (const port of table.ports) {
    if (omit.has(port.name)) continue;
    const subject = `${table.model} port ${port.name}`;
    const supplied = ports[port.name];
    if (supplied === undefined) {
      assert(port.minItems === 0 || defer.has(port.name), `${subject} is required`);
      continue;
    }
    assert(Array.isArray(supplied), `${subject} must be an array`);
    assert(supplied.length >= Math.max(1, port.minItems),
      `${subject} needs at least ${Math.max(1, port.minItems)} value(s)`);
    assert(supplied.length <= port.maxItems, `${subject} accepts at most ${port.maxItems} value(s)`);
    present.add(port.name);
    supplied.forEach((item, index) => {
      const label = port.maxItems === 1 ? subject : `${subject}[${index}]`;
      if (isMediaPort(port)) verifyMediaValue(item, port, label);
      else verifyScalar(item, port.value, label);
    });
  }

  for (const requirement of table.requires) {
    if (requirement.kind === "atMostOneOf") {
      const used = requirement.ports.filter((name) => present.has(name));
      assert(used.length <= 1,
        `${table.model} accepts at most one of ${requirement.ports.join(", ")} but received ${used.join(", ")}`);
      continue;
    }
    if (requirement.kind === "requiresAnyOf") {
      if (!present.has(requirement.port)) continue;
      const satisfied = requirement.anyOf.some((name) => present.has(name) || omit.has(name) || defer.has(name));
      assert(satisfied,
        `${table.model} port ${requirement.port} needs at least one of ${requirement.anyOf.join(", ")}`);
      continue;
    }
    if (requirement.kind === "weightedTotal") {
      const total = Object.entries(requirement.weights).reduce((sum, [name, weight]) => {
        const supplied = ports[name];
        return sum + (Array.isArray(supplied) ? supplied.length : 0) * weight;
      }, 0);
      assert(total <= requirement.maximum,
        `${table.model} uses ${total} of its ${requirement.maximum} shared ${Object.keys(requirement.weights).sort().join("/")} budget`);
      continue;
    }
    if (!present.has(requirement.port)) continue;
    const missing = requirement.needs.filter((name) => !present.has(name) && !omit.has(name) && !defer.has(name));
    assert(missing.length === 0,
      `${table.model} port ${requirement.port} also requires ${missing.join(", ")}`);
  }
}

function deferredPorts(table: GenerationPortTable): readonly string[] {
  return table.ports
    .filter((port) => isMediaPort(port) || port.value.kind === "text")
    .map((port) => port.name);
}

export function verifyRequestDraftAgainstPorts(
  table: GenerationPortTable,
  value: unknown,
): asserts value is GenerationRequestDraft {
  const draft = plainObject(value, `${table.model} request draft`);
  verifyPortsAgainstTable(table, draft.ports, { defer: deferredPorts(table) });
}

export function sealGenerationRequestDraft(
  table: GenerationPortTable,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequestDraft {
  const draft = canonicalize({
    ports: Object.fromEntries(Object.entries(ports).filter(([, values]) => values.length > 0)),
  }) as unknown as GenerationRequestDraft;
  verifyRequestDraftAgainstPorts(table, draft);
  return draft;
}

export function verifyGenerationMediaBinding(
  port: GenerationMediaPort,
  value: unknown,
): asserts value is GenerationMediaBinding {
  const binding = plainObject(value, `${port.name} media binding`);
  verifyMediaItemFields(binding, port, `${port.name} media binding`);
}

export function sealGenerationMediaBinding(
  port: GenerationMediaPort,
  value: GenerationMediaBinding,
): GenerationMediaBinding {
  const binding = canonicalize(value) as unknown as GenerationMediaBinding;
  verifyGenerationMediaBinding(port, binding);
  return binding;
}

/**
 * Attach one Blob supplied by a real graph edge. The returned draft contains
 * the Provider-facing value, while the Graph preserves where that Blob came
 * from; no lineage or project metadata is copied through the payload.
 */
export function bindGenerationMedia(
  table: GenerationPortTable,
  draft: GenerationRequestDraft,
  portName: string,
  binding: GenerationMediaBinding,
  artifact: BlobRef,
): GenerationRequestDraft {
  verifyRequestDraftAgainstPorts(table, draft);
  const port = table.ports.find((candidate): candidate is GenerationMediaPort =>
    candidate.name === portName && isMediaPort(candidate));
  assert(port !== undefined, `${table.model} has no media port ${portName}`);
  verifyGenerationMediaBinding(port, binding);
  const value = {
    role: binding.role,
    artifact,
    ...(binding.fields === undefined ? {} : { fields: binding.fields }),
  };
  verifyMediaValue(value, port, `${table.model} port ${portName}`);
  return sealGenerationRequestDraft(table, {
    ...draft.ports,
    [portName]: [...(draft.ports[portName] ?? []), value],
  });
}

/** Attach one graph Text edge to an exact text port without hiding it in metadata. */
export function bindGenerationText(
  table: GenerationPortTable,
  draft: GenerationRequestDraft,
  portName: string,
  text: Text,
): GenerationRequestDraft {
  verifyRequestDraftAgainstPorts(table, draft);
  verifyText(text);
  const port = table.ports.find((candidate) =>
    candidate.name === portName && candidate.value.kind === "text");
  assert(port !== undefined, `${table.model} has no text port ${portName}`);
  return sealGenerationRequestDraft(table, {
    ...draft.ports,
    [portName]: [...(draft.ports[portName] ?? []), text.value],
  });
}

export function finalizeGenerationRequestDraft(
  table: GenerationPortTable,
  draft: GenerationRequestDraft,
): GenerationRequest {
  verifyRequestDraftAgainstPorts(table, draft);
  return sealGenerationPortRequest(table, draft.ports);
}

export function verifyRequestAgainstPorts(
  table: GenerationPortTable,
  value: unknown,
): asserts value is GenerationRequest {
  assertGenerationPortTable(table);
  const request = plainObject(value, `${table.model} request`);
  verifyPortsAgainstTable(table, request.ports);
}

/** Build one canonical request for a model from its declared ports. */
export function sealGenerationPortRequest(
  table: GenerationPortTable,
  ports: Readonly<Record<string, readonly GenerationPortValue[]>>,
): GenerationRequest {
  const content: GenerationRequest = {
    ports: Object.fromEntries(
      Object.entries(ports).filter(([, values]) => values !== undefined && values.length > 0),
    ),
  };
  const request = sealGenerationRequest(content);
  verifyRequestAgainstPorts(table, request);
  return request;
}

/** Which ports this request actually populates; drives Provider routing and coverage. */
export function presentPorts(request: GenerationRequest): ReadonlySet<string> {
  return new Set(Object.keys(request.ports));
}
