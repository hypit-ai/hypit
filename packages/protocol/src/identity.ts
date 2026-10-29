/** Opaque identity for one stored byte resource. Equal bytes may have different identities. */
export type ResourceId = `res_${string}`;

export type RecordId = string;
export type LogicalOutputId = string;
export type OperationId = string;
export type NeedId = string;
export type StepId = string;
export type CommandId = string;

export type ModuleRef = {
  readonly name: string;
  readonly version: string;
};

declare const referenceKind: unique symbol;

type NamedRef<Kind extends string> = {
  readonly module: ModuleRef;
  readonly name: string;
  /** Compile-time namespace only; absent from serialized Protocol values. */
  readonly [referenceKind]?: Kind;
};

/**
 * A Type is its owning Module and its name, and nothing else is compared. Two Types whose values
 * carry identical shapes are distinct, so one is refused where the other is declared — there is no
 * structural fallback to fall back to.
 */
export type TypeRef = NamedRef<"type">;

export type ProducerRef = NamedRef<"producer">;

export type CapabilityRef = NamedRef<"capability">;

function nonEmpty(value: string, subject: string): string {
  if (value.trim().length === 0) throw new Error(`${subject} must not be empty`);
  return value;
}

function without(value: string, delimiter: string, subject: string): string {
  if (value.includes(delimiter)) throw new Error(`${subject} must not contain ${delimiter}`);
  return value;
}

export function createModuleRef(name: string, version: string): ModuleRef {
  return {
    name: nonEmpty(name, "Module name"),
    version: without(nonEmpty(version, "Module version"), "@", "Module version"),
  };
}

export function createTypeRef(module: ModuleRef, name: string): TypeRef {
  return { module, name: without(nonEmpty(name, "Type name"), "#", "Type name") };
}

export function createProducerRef(module: ModuleRef, name: string): ProducerRef {
  return { module, name: without(nonEmpty(name, "Producer name"), "#", "Producer name") };
}

export function createCapabilityRef(module: ModuleRef, name: string): CapabilityRef {
  return { module, name: without(nonEmpty(name, "Capability name"), "#", "Capability name") };
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

export function isModuleRef(value: unknown): value is ModuleRef {
  return isObject(value)
    && typeof value.name === "string" && value.name.trim().length > 0
    && typeof value.version === "string" && value.version.trim().length > 0
    && !value.version.includes("@");
}

function isNamedRef(value: unknown): value is { readonly module: ModuleRef; readonly name: string } {
  return isObject(value) && isModuleRef(value.module)
    && typeof value.name === "string" && value.name.trim().length > 0
    && !value.name.includes("#");
}

/** Collision-free internal identity for a Module tuple. Never shown as author syntax. */
export function moduleIdentity(ref: ModuleRef): string {
  return JSON.stringify([ref.name, ref.version]);
}

function namedIdentity(ref: { readonly module: ModuleRef; readonly name: string }): string {
  return JSON.stringify([ref.module.name, ref.module.version, ref.name]);
}

/** Collision-free internal identity for a Type tuple. */
export function typeIdentity(ref: TypeRef): string {
  return namedIdentity(ref);
}

/** Collision-free internal identity for a Producer tuple. */
export function producerIdentity(ref: ProducerRef): string {
  return namedIdentity(ref);
}

/** Collision-free internal identity for a Capability tuple. */
export function capabilityIdentity(ref: CapabilityRef): string {
  return namedIdentity(ref);
}

export function isTypeRef(value: unknown): value is TypeRef {
  return isNamedRef(value);
}

export function isProducerRef(value: unknown): value is ProducerRef {
  return isNamedRef(value);
}

export function isCapabilityRef(value: unknown): value is CapabilityRef {
  return isNamedRef(value);
}

export function moduleKey(ref: ModuleRef): string {
  return `${ref.name}@${ref.version}`;
}

export function typeKey(ref: TypeRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function producerKey(ref: ProducerRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function capabilityKey(ref: CapabilityRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function parseModuleKey(value: string): ModuleRef {
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`${value} must use module@version`);
  }
  return createModuleRef(value.slice(0, separator), value.slice(separator + 1));
}

function parseNamedKey(value: string, subject: string): { readonly module: ModuleRef; readonly name: string } {
  const separator = value.lastIndexOf("#");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`${subject} ${value} must use module@version#name`);
  }
  return {
    module: parseModuleKey(value.slice(0, separator)),
    name: nonEmpty(value.slice(separator + 1), `${subject} name`),
  };
}

export function parseTypeKey(value: string): TypeRef {
  const parsed = parseNamedKey(value, "Type");
  return createTypeRef(parsed.module, parsed.name);
}

export function parseProducerKey(value: string): ProducerRef {
  const parsed = parseNamedKey(value, "Producer");
  return createProducerRef(parsed.module, parsed.name);
}

export function parseCapabilityKey(value: string): CapabilityRef {
  try {
    const parsed = parseNamedKey(value, "Capability");
    return createCapabilityRef(parsed.module, parsed.name);
  } catch (error) {
    throw new Error(`${value} is not a capability key of the form module@version#capability`, { cause: error });
  }
}

export function sameModule(left: ModuleRef, right: ModuleRef): boolean {
  return left.name === right.name && left.version === right.version;
}

export function sameType(left: TypeRef, right: TypeRef): boolean {
  return sameModule(left.module, right.module) && left.name === right.name;
}

export function sameProducer(left: ProducerRef, right: ProducerRef): boolean {
  return sameModule(left.module, right.module) && left.name === right.name;
}

export function sameCapability(left: CapabilityRef, right: CapabilityRef): boolean {
  return sameModule(left.module, right.module) && left.name === right.name;
}
