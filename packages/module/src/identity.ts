import {
  isModuleRef,
  moduleKey,
  parseModuleKey,
  sameModule,
  type ModuleRef,
} from "./reference.js";

declare const producerReferenceKind: unique symbol;

export type ProducerRef = {
  readonly module: ModuleRef;
  readonly name: string;
  /** Compile-time namespace only; absent from serialized values. */
  readonly [producerReferenceKind]?: "producer";
};

function nonEmpty(value: string, subject: string): string {
  if (value.trim().length === 0) throw new Error(`${subject} must not be empty`);
  return value;
}

function without(value: string, delimiter: string, subject: string): string {
  if (value.includes(delimiter)) throw new Error(`${subject} must not contain ${delimiter}`);
  return value;
}

export function createProducerRef(module: ModuleRef, name: string): ProducerRef {
  return { module, name: without(nonEmpty(name, "Producer name"), "#", "Producer name") };
}

export function isProducerRef(value: unknown): value is ProducerRef {
  return value !== null && !Array.isArray(value) && typeof value === "object"
    && Object.keys(value).length === 2
    && isModuleRef((value as { readonly module?: unknown }).module)
    && typeof (value as { readonly name?: unknown }).name === "string"
    && (value as { readonly name: string }).name.trim().length > 0
    && !(value as { readonly name: string }).name.includes("#");
}

export function producerIdentity(ref: ProducerRef): string {
  return JSON.stringify([ref.module.name, ref.name]);
}

export function producerKey(ref: ProducerRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function parseProducerKey(value: string): ProducerRef {
  const separator = value.lastIndexOf("#");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Producer ${value} must use module#name`);
  }
  return createProducerRef(
    parseModuleKey(value.slice(0, separator)),
    nonEmpty(value.slice(separator + 1), "Producer name"),
  );
}

export function sameProducer(left: ProducerRef, right: ProducerRef): boolean {
  return sameModule(left.module, right.module) && left.name === right.name;
}
