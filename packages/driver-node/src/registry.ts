import type {
  CapabilityRef,
  Digest,
  Need,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";

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

function sameRef(
  left: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
  right: { readonly module: { readonly name: string; readonly version: string }; readonly name: string },
): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

export function producerRegistryKey(ref: ProducerRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function providerCapabilityKey(ref: CapabilityRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function providerReturnKey(ref: TypeRef): string {
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

type ProviderOptions = { readonly supports?: (need: Need) => boolean };

export class ProviderRegistry {
  readonly #registrations: ProviderRegistration[] = [];
  readonly #bindings = new Map<string, string>();

  registerProvider(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    handler: ProviderHandler,
    options: ProviderOptions = {},
  ): void {
    if (!id.trim()) throw new Error("provider id must not be empty");
    const duplicate = this.#registrations.some((candidate) =>
      candidate.id === id && sameRef(candidate.capability, capability));
    if (duplicate) throw new Error(`provider ${id} already registers ${providerCapabilityKey(capability)}`);
    this.#registrations.push({ id, capability, returns, handler, ...options });
  }

  bind(capability: CapabilityRef, providerId: string): void {
    const key = providerCapabilityKey(capability);
    if (!this.#registrations.some((registration) =>
      registration.id === providerId && sameRef(registration.capability, capability))) {
      throw new Error(`provider ${providerId} does not register capability ${key}`);
    }
    this.#bindings.set(key, providerId);
  }

  resolve(need: Need): ProviderResolution {
    const key = providerCapabilityKey(need.capability);
    const bound = this.#bindings.get(key);
    const registrations = this.#registrations.filter((registration) =>
      sameRef(registration.capability, need.capability)
      && sameRef(registration.returns, need.returns)
      && (registration.supports?.(need) ?? true));
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

  providers(capability: CapabilityRef): readonly ProviderRegistration[] {
    return this.#registrations.filter((registration) => sameRef(registration.capability, capability));
  }
}
