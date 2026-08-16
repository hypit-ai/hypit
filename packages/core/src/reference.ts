import type { CapabilityRef, ModuleRef, ProducerRef, TypeRef } from "@narratage/protocol";

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
