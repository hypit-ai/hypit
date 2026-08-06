import type {
  ProducerRegistrar,
} from "@svml/component-kit";
import type {
  CapabilityRef,
  Digest,
  Need,
  ProducerRef,
  TypeRef,
} from "@svml/protocol";
import { isDigest } from "@svml/protocol";
import {
  RuntimeModuleRegistry,
  runtimeProvider,
  verifyCredentialRef,
  verifyRuntimeClosure,
} from "@svml/runtime";
import type { ResolveRuntimeProfileOptions, RuntimeClosure } from "@svml/runtime";

import type {
  ProducerHandler,
  ProducerRegistration,
  ProviderEndpoint,
  ProviderHandler,
  ProviderRegistration,
  ProviderResolution,
  RuntimeProviderImplementation,
  SchedulingHint,
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

function verifyScheduling(scheduling: SchedulingHint | undefined): void {
  if (scheduling === undefined) return;
  if (scheduling.lane !== undefined && scheduling.lane.trim().length === 0) {
    throw new Error("scheduling lane must not be empty");
  }
  if (scheduling.maxConcurrency !== undefined
    && (!Number.isSafeInteger(scheduling.maxConcurrency) || scheduling.maxConcurrency < 1)) {
    throw new Error("scheduling maxConcurrency must be a positive safe integer");
  }
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

export class HostRegistry implements ProducerRegistrar {
  readonly #producers = new Map<string, ProducerRegistration>();

  registerProducer(
    producer: ProducerRef,
    implementationDigest: Digest,
    handler: ProducerHandler,
    options: { readonly scheduling?: SchedulingHint } = {},
  ): void {
    const key = producerRegistryKey(producer);
    if (this.#producers.has(key)) throw new Error(`producer ${key} is already registered`);
    verifyScheduling(options.scheduling);
    this.#producers.set(key, { producer, implementationDigest, handler, ...options });
  }

  producer(ref: ProducerRef): ProducerRegistration | undefined {
    return this.#producers.get(producerRegistryKey(ref));
  }
}

type ProviderOptions = {
  readonly supports?: (need: Need) => boolean;
  readonly scheduling?: SchedulingHint;
  readonly runtimeImplementation?: RuntimeProviderImplementation;
  readonly credentials?: NonNullable<ProviderRegistration["credentials"]>;
  readonly retry?: NonNullable<ProviderRegistration["retry"]>;
};

function verifyProviderOptions(options: ProviderOptions): void {
  verifyScheduling(options.scheduling);
  for (const [slot, ref] of Object.entries(options.credentials ?? {})) {
    if (slot.trim().length === 0) throw new Error("Provider credential slot must not be empty");
    verifyCredentialRef(ref);
  }
  if (options.retry !== undefined
    && (!Number.isSafeInteger(options.retry.maxAttempts) || options.retry.maxAttempts < 1)) {
    throw new Error("Provider retry maxAttempts must be a positive safe integer");
  }
}

export class ProviderRegistry {
  readonly #registrations: ProviderRegistration[] = [];
  readonly #bindings = new Map<string, string>();
  readonly #runtimeScheduling = new Map<string, SchedulingHint>();
  #runtimeClosure: Digest | undefined;

  registerProvider(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    handler: ProviderHandler,
    options: ProviderOptions = {},
  ): void {
    if (!id.trim()) throw new Error("provider id must not be empty");
    verifyProviderOptions(options);
    if (options.runtimeImplementation !== undefined) {
      if (!isDigest(options.runtimeImplementation.digest)) {
        throw new Error("Provider runtime implementation digest is invalid");
      }
      if (!isDigest(options.runtimeImplementation.configurationDigest)) {
        throw new Error("Provider runtime configuration digest is invalid");
      }
      const facet = options.runtimeImplementation.facet;
      if (!facet.name.trim() || !facet.module.name.trim() || !facet.module.version.trim()) {
        throw new Error("Provider runtime implementation facet is invalid");
      }
    }
    const duplicate = this.#registrations.some((candidate) =>
      candidate.id === id && sameRef(candidate.capability, capability));
    if (duplicate) throw new Error(`provider ${id} already registers ${providerCapabilityKey(capability)}`);
    this.#registrations.push({ kind: "handler", id, capability, returns, handler, ...options });
  }

  registerProviderEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    endpoint: ProviderEndpoint,
    options: ProviderOptions = {},
  ): void {
    if (!id.trim()) throw new Error("provider id must not be empty");
    verifyProviderOptions(options);
    if (options.runtimeImplementation === undefined || !isDigest(options.runtimeImplementation.digest)) {
      throw new Error("recoverable Provider Endpoint requires a valid Runtime implementation identity");
    }
    if (!isDigest(options.runtimeImplementation.configurationDigest)) {
      throw new Error("recoverable Provider Endpoint requires a valid Runtime configuration identity");
    }
    const facet = options.runtimeImplementation.facet;
    if (!facet.name.trim() || !facet.module.name.trim() || !facet.module.version.trim()) {
      throw new Error("Provider runtime implementation facet is invalid");
    }
    const duplicate = this.#registrations.some((candidate) =>
      candidate.id === id && sameRef(candidate.capability, capability));
    if (duplicate) throw new Error(`provider ${id} already registers ${providerCapabilityKey(capability)}`);
    this.#registrations.push({ kind: "endpoint", id, capability, returns, endpoint, ...options });
  }

  runtimeClosureDigest(): Digest | undefined {
    return this.#runtimeClosure;
  }

  bind(capability: CapabilityRef, providerId: string): void {
    const key = providerCapabilityKey(capability);
    if (!this.#registrations.some((registration) =>
      registration.id === providerId && sameRef(registration.capability, capability))) {
      throw new Error(`provider ${providerId} does not register capability ${key}`);
    }
    this.#bindings.set(key, providerId);
  }

  /** Bind only implementation-verified Endpoint instances from one locked Runtime Closure. */
  applyRuntimeClosure(
    closure: RuntimeClosure,
    modules: RuntimeModuleRegistry,
    options: ResolveRuntimeProfileOptions = {},
  ): void {
    verifyRuntimeClosure(closure);
    modules.verifyClosure(closure, options);
    if (this.#runtimeClosure !== undefined && this.#runtimeClosure !== closure.digest) {
      throw new Error("Provider Registry is already bound to another Runtime Closure");
    }
    const pending: { readonly key: string; readonly endpoint: string; readonly scheduling: SchedulingHint }[] = [];
    for (const binding of closure.providers) {
      const endpoint = runtimeProvider(closure, binding.endpoint);
      if (endpoint === undefined) throw new Error(`Runtime Endpoint ${binding.endpoint} is unavailable`);
      const registration = this.#registrations.find((candidate) =>
        candidate.id === endpoint.id
        && sameRef(candidate.capability, binding.capability)
        && sameRef(candidate.returns, binding.returns));
      if (registration === undefined) {
        throw new Error(`Provider ${endpoint.id} is not registered for ${providerCapabilityKey(binding.capability)}`);
      }
      const expectedKind = endpoint.lifecycle === "recoverable" ? "endpoint" : "handler";
      if (registration.kind !== expectedKind) {
        throw new Error(`Provider ${endpoint.id} lifecycle does not match the Runtime Closure`);
      }
      const implementation = registration.runtimeImplementation;
      if (implementation === undefined
        || implementation.digest !== endpoint.implementation.digest
        || implementation.configurationDigest !== endpoint.configurationDigest
        || !sameRef(implementation.facet, endpoint.facet)) {
        throw new Error(`Provider ${endpoint.id} implementation does not match the Runtime Closure`);
      }
      const credentialSlots = Object.keys(registration.credentials ?? {}).sort();
      if (JSON.stringify(credentialSlots) !== JSON.stringify(endpoint.credentialSlots)) {
        throw new Error(`Provider ${endpoint.id} credential slots do not match the Runtime Closure`);
      }
      pending.push({
        key: providerCapabilityKey(binding.capability),
        endpoint: endpoint.id,
        scheduling: { lane: endpoint.lane, maxConcurrency: endpoint.maxConcurrency },
      });
    }
    for (const item of pending) {
      this.#bindings.set(item.key, item.endpoint);
      this.#runtimeScheduling.set(item.endpoint, item.scheduling);
    }
    this.#runtimeClosure = closure.digest;
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
      const scheduling = registration === undefined
        ? undefined
        : this.#runtimeScheduling.get(registration.id) ?? registration.scheduling;
      return registration === undefined
        ? { status: "missing", providerId: bound }
        : {
            status: "resolved",
            registration: scheduling === undefined ? registration : { ...registration, scheduling },
          };
    }
    if (registrations.length === 0) return { status: "missing" };
    if (registrations.length > 1) {
      return {
        status: "ambiguous",
        providerIds: registrations.map((registration) => registration.id).sort(),
      };
    }
    const registration = registrations[0]!;
    const scheduling = this.#runtimeScheduling.get(registration.id) ?? registration.scheduling;
    return {
      status: "resolved",
      registration: scheduling === undefined ? registration : { ...registration, scheduling },
    };
  }

  providers(capability: CapabilityRef): readonly ProviderRegistration[] {
    return this.#registrations.filter((registration) => sameRef(registration.capability, capability));
  }
}
