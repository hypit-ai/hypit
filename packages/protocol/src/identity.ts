export type Digest = `sha256:${string}`;

export type RecordId = string;
export type LogicalOutputId = string;
export type CandidateId = string;
export type OperationId = string;
export type NeedId = string;
export type StepId = string;
export type CommandId = string;

export type ModuleRef = {
  readonly name: string;
  readonly version: string;
};

/**
 * A Type is its owning Module and its name, and nothing else is compared. Two Types whose values
 * carry identical shapes are distinct, so one is refused where the other is declared — there is no
 * structural fallback to fall back to.
 */
export type TypeRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type ProducerRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type CapabilityRef = {
  readonly module: ModuleRef;
  readonly name: string;
};

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

export function sameModule(left: ModuleRef, right: ModuleRef): boolean {
  return left.name === right.name && left.version === right.version;
}

export function sameType(left: TypeRef, right: TypeRef): boolean {
  return sameModule(left.module, right.module) && left.name === right.name;
}
