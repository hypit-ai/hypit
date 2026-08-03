import type { Digest, ProducerRef, TypeRef } from "@svml/protocol";

import type {
  ProducerHandler,
  ProducerRegistration,
  RequirementHandler,
  RequirementRegistration,
} from "./types.js";

function moduleKey(ref: { readonly name: string; readonly version: string }): string {
  return `${ref.name}@${ref.version}`;
}

export function producerRegistryKey(ref: ProducerRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function requirementRegistryKey(ref: TypeRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export class HostRegistry {
  readonly #producers = new Map<string, ProducerRegistration>();
  readonly #requirements = new Map<string, RequirementRegistration>();

  registerProducer(
    producer: ProducerRef,
    implementationDigest: Digest,
    handler: ProducerHandler,
  ): void {
    const key = producerRegistryKey(producer);
    if (this.#producers.has(key)) throw new Error(`producer ${key} is already registered`);
    this.#producers.set(key, { producer, implementationDigest, handler });
  }

  registerRequirement(type: TypeRef, handler: RequirementHandler): void {
    const key = requirementRegistryKey(type);
    if (this.#requirements.has(key)) throw new Error(`requirement ${key} is already registered`);
    this.#requirements.set(key, { type, handler });
  }

  producer(ref: ProducerRef): ProducerRegistration | undefined {
    return this.#producers.get(producerRegistryKey(ref));
  }

  requirement(ref: TypeRef): RequirementRegistration | undefined {
    return this.#requirements.get(requirementRegistryKey(ref));
  }
}
