import type { Digest, Need, ProducerRef, TypeRef } from "@svml/protocol";

import type {
  ProducerHandler,
  ProducerRegistration,
  ProviderHandler,
  ProviderRegistration,
  ProviderResolution,
} from "./types.js";

function moduleKey(ref: { readonly name: string; readonly version: string }): string {
  return `${ref.name}@${ref.version}`;
}

export function producerRegistryKey(ref: ProducerRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function providerCapabilityKey(ref: TypeRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export class HostRegistry {
  readonly #producers = new Map<string, ProducerRegistration>();

  registerProducer(
    producer: ProducerRef,
    implementationDigest: Digest,
    handler: ProducerHandler,
  ): void {
    const key = producerRegistryKey(producer);
    if (this.#producers.has(key)) throw new Error(`producer ${key} is already registered`);
    this.#producers.set(key, { producer, implementationDigest, handler });
  }

  producer(ref: ProducerRef): ProducerRegistration | undefined {
    return this.#producers.get(producerRegistryKey(ref));
  }
}

export class ProviderRegistry {
  readonly #capabilities = new Map<string, ProviderRegistration[]>();
  readonly #bindings = new Map<string, string>();

  registerProvider(
    id: string,
    wants: TypeRef,
    handler: ProviderHandler,
    options: { readonly supports?: (need: Need) => boolean } = {},
  ): void {
    if (!id.trim()) throw new Error("provider id must not be empty");
    const key = providerCapabilityKey(wants);
    const registrations = this.#capabilities.get(key) ?? [];
    if (registrations.some((registration) => registration.id === id)) {
      throw new Error(`provider ${id} already registers capability ${key}`);
    }
    registrations.push({ id, wants, handler, ...options });
    this.#capabilities.set(key, registrations);
  }

  bind(wants: TypeRef, providerId: string): void {
    const key = providerCapabilityKey(wants);
    if (!(this.#capabilities.get(key) ?? []).some((registration) => registration.id === providerId)) {
      throw new Error(`provider ${providerId} does not register capability ${key}`);
    }
    this.#bindings.set(key, providerId);
  }

  resolve(need: Need): ProviderResolution {
    const key = providerCapabilityKey(need.wants);
    const bound = this.#bindings.get(key);
    const registrations = (this.#capabilities.get(key) ?? [])
      .filter((registration) => registration.supports?.(need) ?? true);
    if (bound !== undefined) {
      const registration = registrations.find((candidate) => candidate.id === bound);
      return registration === undefined
        ? { status: "missing", providerId: bound }
        : { status: "resolved", registration };
    }
    if (registrations.length === 0) return { status: "missing" };
    if (registrations.length > 1) {
      return {
        status: "ambiguous",
        providerIds: registrations.map((registration) => registration.id).sort(),
      };
    }
    return { status: "resolved", registration: registrations[0]! };
  }

  providers(wants: TypeRef): readonly ProviderRegistration[] {
    return [...(this.#capabilities.get(providerCapabilityKey(wants)) ?? [])];
  }
}
