import type { InvocationAddress, InvocationObservation, JsonValue, Publication, PublicationResource } from "../index.js";
import type { ProviderReceipt } from "../provider.js";
import { identity, integer, json, object, text, timestamp } from "./values.js";

const phases = ["queued", "submitting", "running", "collecting", "received", "complete", "failed", "cancelled"] as const;
const cancellations = ["requested", "accepted", "confirmed", "unsupported", "too-late", "failed"] as const;

export type InvocationRecord = Omit<InvocationObservation, "receipt"> & {
  readonly format: "hypit.invocation";
  readonly request: JsonValue;
  readonly inputs: Readonly<Record<string, PublicationResource>>;
  readonly claims: readonly string[];
  readonly receipt?: ProviderReceipt;
  readonly wakeAt?: number;
  readonly received?: Publication;
};

export function terminal(record: InvocationRecord): boolean {
  return record.phase === "complete" || record.phase === "failed" || record.phase === "cancelled";
}

const invocationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function invocationId(value: unknown): string {
  const id = text(value, "Invocation id");
  if (!invocationPattern.test(id)) throw new Error("Invocation id must be a UUID v4.");
  return id;
}

export function sameAddress(value: unknown, expected: InvocationAddress): void {
  const address = object(value, "Invocation address", ["environment", "invocation"]);
  if (address.environment !== expected.environment || address.invocation !== expected.invocation) {
    throw new Error("Invocation address does not match its Environment and directory.");
  }
}

function oneOf<T extends string>(value: unknown, label: string, members: readonly T[]): T {
  const member = members.find(option => option === value);
  if (member === undefined) throw new Error(`${label} is invalid.`);
  return member;
}

export function readResources(value: unknown, group: "inputs" | "files"): Record<string, PublicationResource> {
  return Object.fromEntries(Object.entries(object(value, "Resources")).map(([name, field]) => {
    identity(name, "Resource name");
    const resource = object(field, "Resource", ["path", "mediaType", "size"]);
    const path = text(resource.path, "Resource path");
    if (!path.startsWith(`${group}/`) || !/^\d+\.bin$/u.test(path.slice(group.length + 1))) {
      throw new Error(`Resource ${name} must reference a file in ${group}.`);
    }
    return [name, { path, mediaType: text(resource.mediaType, "Resource media type"),
      size: integer(resource.size, "Resource size", 0) }];
  }));
}

export function readPublication(value: unknown, address: InvocationAddress): Publication {
  const record = object(value, "Publication", ["format", "address", "capability", "publishedAt", "outputs"]);
  if (record.format !== "hypit.publication") throw new Error("Publication format is invalid.");
  sameAddress(record.address, address);
  const entries = Object.entries(object(record.outputs, "Publication outputs"));
  if (entries.length === 0) throw new Error("Publication must contain at least one output.");
  const outputs = Object.fromEntries(entries.map(([name, value]) => {
    identity(name, "Output name");
    const output = object(value, "Publication output", ["type", "value", "resources"]);
    return [name, { type: text(output.type, "Output type"), value: json(output.value, "Output value"),
      resources: readResources(output.resources, "files") }];
  }));
  return { format: "hypit.publication", address, capability: text(record.capability, "Capability id"),
    publishedAt: timestamp(record.publishedAt, "Publication timestamp"), outputs };
}

export function readReceipt(value: unknown): ProviderReceipt {
  const record = object(value, "Provider receipt", ["id", "resume"]);
  return { id: text(record.id, "Provider task id"),
    ...(record.resume === undefined ? {} : { resume: json(record.resume, "Provider resume data") }) };
}

export function readInvocation(value: unknown, address: InvocationAddress): InvocationRecord {
  const record = object(value, "Invocation", ["format", "address", "capability", "endpoint", "phase", "createdAt",
    "updatedAt", "request", "inputs", "claims", "receipt", "wakeAt", "progress", "failure", "cancellation", "received"]);
  if (record.format !== "hypit.invocation") throw new Error("Invocation format is invalid.");
  sameAddress(record.address, address);
  const phase = oneOf(record.phase, "Invocation phase", phases);
  if (!Array.isArray(record.claims)) throw new Error("Invocation must list its capacity claims.");
  const claims = record.claims.map(value => identity(value, "Capacity claim"));
  if (new Set(claims).size !== claims.length) throw new Error("Invocation repeats a capacity claim.");
  const failure = record.failure === undefined ? undefined : object(record.failure, "Invocation failure", ["code", "message"]);
  const received = record.received === undefined ? undefined : readPublication(record.received, address);
  const receipt = record.receipt === undefined ? undefined : readReceipt(record.receipt);
  if ((received !== undefined) !== (phase === "received") || (failure !== undefined) !== (phase === "failed")
    || ((phase === "running" || phase === "collecting") && receipt === undefined)
    || (phase === "queued" && receipt !== undefined)
    || (record.wakeAt !== undefined && phase !== "running" && phase !== "collecting"
      && !(phase === "submitting" && receipt !== undefined))) {
    throw new Error(`Invocation has inconsistent ${phase} state.`);
  }
  const capability = text(record.capability, "Capability id");
  if (received !== undefined && received.capability !== capability) throw new Error("Publication capability differs.");
  return {
    format: "hypit.invocation", address, phase, capability, endpoint: identity(record.endpoint, "Endpoint id"),
    request: json(record.request, "Invocation request"), inputs: readResources(record.inputs, "inputs"), claims,
    createdAt: timestamp(record.createdAt, "Creation timestamp"), updatedAt: timestamp(record.updatedAt, "Update timestamp"),
    ...(receipt === undefined ? {} : { receipt }),
    ...(failure === undefined ? {} : { failure: { code: text(failure.code, "Failure code"), message: text(failure.message, "Failure message") } }),
    ...(record.wakeAt === undefined ? {} : { wakeAt: integer(record.wakeAt, "Wake time", 0) }),
    ...(record.progress === undefined ? {} : { progress: text(record.progress, "Progress") }),
    ...(record.cancellation === undefined ? {} : { cancellation: oneOf(record.cancellation, "Cancellation", cancellations) }),
    ...(received === undefined ? {} : { received }),
  };
}

export function observe(record: InvocationRecord): InvocationObservation {
  const { format, request, inputs, claims, received, receipt, wakeAt, ...visible } = record;
  return structuredClone(receipt === undefined ? visible : { ...visible, receipt: { id: receipt.id } });
}
