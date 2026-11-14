export type ModuleRef = {
  readonly name: string;
};

declare const referenceKind: unique symbol;

type NamedRef<Kind extends string> = {
  readonly module: ModuleRef;
  readonly name: string;
  /** Compile-time namespace only; absent from serialized values. */
  readonly [referenceKind]?: Kind;
};

export type TypeRef = NamedRef<"type">;

export type CapabilityRef = NamedRef<"capability">;

function nonEmpty(value: string, subject: string): string {
  if (value.trim().length === 0) throw new Error(`${subject} must not be empty`);
  return value;
}

function without(value: string, delimiter: string, subject: string): string {
  if (value.includes(delimiter)) throw new Error(`${subject} must not contain ${delimiter}`);
  return value;
}

function validModuleName(value: string): boolean {
  if (value.trim() !== value || value.length === 0 || value.includes("#")) return false;
  if (!value.startsWith("@")) return !value.includes("@");
  const slash = value.indexOf("/", 1);
  return slash > 1 && value.indexOf("@", 1) < 0;
}

export function createModuleRef(name: string): ModuleRef {
  nonEmpty(name, "Module name");
  without(name, "#", "Module name");
  if (!validModuleName(name)) throw new Error("Module name must be an unversioned logical package name");
  return { name };
}

export function createTypeRef(module: ModuleRef, name: string): TypeRef {
  return { module, name: without(nonEmpty(name, "Type name"), "#", "Type name") };
}

export function createCapabilityRef(module: ModuleRef, name: string): CapabilityRef {
  return { module, name: without(nonEmpty(name, "Capability name"), "#", "Capability name") };
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

export function isModuleRef(value: unknown): value is ModuleRef {
  return isObject(value)
    && Object.keys(value).length === 1
    && typeof value.name === "string" && validModuleName(value.name);
}

function isNamedRef(value: unknown): value is { readonly module: ModuleRef; readonly name: string } {
  return isObject(value) && Object.keys(value).length === 2 && isModuleRef(value.module)
    && typeof value.name === "string" && value.name.trim().length > 0
    && !value.name.includes("#");
}

export function moduleIdentity(ref: ModuleRef): string {
  return ref.name;
}

function namedIdentity(ref: { readonly module: ModuleRef; readonly name: string }): string {
  return JSON.stringify([ref.module.name, ref.name]);
}

export function typeIdentity(ref: TypeRef): string {
  return namedIdentity(ref);
}

export function capabilityIdentity(ref: CapabilityRef): string {
  return namedIdentity(ref);
}

export function isTypeRef(value: unknown): value is TypeRef {
  return isNamedRef(value);
}

export function isCapabilityRef(value: unknown): value is CapabilityRef {
  return isNamedRef(value);
}

export function moduleKey(ref: ModuleRef): string {
  return ref.name;
}

export function typeKey(ref: TypeRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function capabilityKey(ref: CapabilityRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function parseModuleKey(value: string): ModuleRef {
  return createModuleRef(value);
}

function parseNamedKey(value: string, subject: string): { readonly module: ModuleRef; readonly name: string } {
  const separator = value.lastIndexOf("#");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`${subject} ${value} must use module#name`);
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

export function parseCapabilityKey(value: string): CapabilityRef {
  try {
    const parsed = parseNamedKey(value, "Capability");
    return createCapabilityRef(parsed.module, parsed.name);
  } catch (error) {
    throw new Error(`${value} is not a capability key of the form module#capability`, { cause: error });
  }
}

export function sameModule(left: ModuleRef, right: ModuleRef): boolean {
  return left.name === right.name;
}

export function sameType(left: TypeRef, right: TypeRef): boolean {
  return sameModule(left.module, right.module) && left.name === right.name;
}

export function sameCapability(left: CapabilityRef, right: CapabilityRef): boolean {
  return sameModule(left.module, right.module) && left.name === right.name;
}
