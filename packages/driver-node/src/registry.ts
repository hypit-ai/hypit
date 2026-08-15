import type {
  EndpointRegistrar,
  EndpointRegistrationOptions,
  ImmediateEndpointHandler,
  RecoverableEndpoint,
} from "@narratage/endpoint-kit";
import type {
  ProducerRegistrar,
} from "@narratage/component-kit";
import type {
  CapabilityRef,
  Digest,
  Need,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";
import { isDigest } from "@narratage/protocol";
import {
  RuntimeModuleRegistry,
  runtimeEndpoint,
  verifyCredentialRef,
} from "@narratage/runtime";
import type { RuntimeClosure } from "@narratage/runtime";

import type {
  ProducerHandler,
  ProducerRegistration,
  EndpointRegistration,
  EndpointResolution,
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
  if (scheduling.resources.length === 0) throw new Error("scheduling resources must not be empty");
  const ids = scheduling.resources.map((resource) => {
    if (resource.id.trim().length === 0) throw new Error("scheduling resource id must not be empty");
    for (const [name, value] of [["maxActive", resource.maxActive], ["maxInFlight", resource.maxInFlight]] as const) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`scheduling resource ${resource.id} ${name} must be a positive safe integer`);
      }
    }
    return resource.id;
  });
  if (new Set(ids).size !== ids.length) throw new Error("scheduling resources contain duplicate ids");
  if (scheduling.queue !== undefined
    && (scheduling.queue.authority.trim().length === 0 || scheduling.queue.route.trim().length === 0)) {
    throw new Error("scheduling queue authority and route must not be empty");
  }
}

export function producerRegistryKey(ref: ProducerRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function endpointCapabilityKey(ref: CapabilityRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export function endpointReturnKey(ref: TypeRef): string {
  return `${moduleKey(ref.module)}#${ref.name}`;
}

export class ProducerRegistry implements ProducerRegistrar {
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
    this.#producers.set(key, { implementationDigest, handler, ...options });
  }

  producer(ref: ProducerRef): ProducerRegistration | undefined {
    return this.#producers.get(producerRegistryKey(ref));
  }
}

type EndpointOptions = EndpointRegistrationOptions;

function verifyEndpointOptions(options: EndpointOptions): void {
  verifyScheduling(options.scheduling);
  for (const [slot, ref] of Object.entries(options.credentials ?? {})) {
    if (slot.trim().length === 0) throw new Error("Endpoint credential slot must not be empty");
    verifyCredentialRef(ref);
  }
  if (options.retry !== undefined
    && (!Number.isSafeInteger(options.retry.maxAttempts) || options.retry.maxAttempts < 1)) {
    throw new Error("Endpoint retry maxAttempts must be a positive safe integer");
  }
}

export class EndpointRegistry implements EndpointRegistrar {
  readonly #registrations: EndpointRegistration[] = [];
  readonly #bindings = new Map<string, string>();
  readonly #runtimeScheduling = new Map<string, SchedulingHint>();
  #runtimeClosure: Digest | undefined;

  registerImmediateEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    handler: ImmediateEndpointHandler,
    options: EndpointOptions = {},
  ): void {
    if (!id.trim()) throw new Error("endpoint id must not be empty");
    verifyEndpointOptions(options);
    if (options.runtimeImplementation !== undefined) {
      if (!isDigest(options.runtimeImplementation.digest)) {
        throw new Error("Endpoint runtime implementation digest is invalid");
      }
      if (!isDigest(options.runtimeImplementation.configurationDigest)) {
        throw new Error("Endpoint runtime configuration digest is invalid");
      }
      const facet = options.runtimeImplementation.facet;
      if (!facet.name.trim() || !facet.module.name.trim() || !facet.module.version.trim()) {
        throw new Error("Endpoint runtime implementation facet is invalid");
      }
    }
    const duplicate = this.#registrations.some((candidate) =>
      candidate.id === id && sameRef(candidate.capability, capability));
    if (duplicate) throw new Error(`endpoint ${id} already registers ${endpointCapabilityKey(capability)}`);
    this.#registrations.push({ kind: "immediate", id, capability, returns, handler, ...options });
  }

  registerRecoverableEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    endpoint: RecoverableEndpoint,
    options: EndpointOptions = {},
  ): void {
    if (!id.trim()) throw new Error("endpoint id must not be empty");
    verifyEndpointOptions(options);
    if (options.runtimeImplementation === undefined || !isDigest(options.runtimeImplementation.digest)) {
      throw new Error("recoverable Endpoint requires a valid Runtime implementation identity");
    }
    if (!isDigest(options.runtimeImplementation.configurationDigest)) {
      throw new Error("recoverable Endpoint requires a valid Runtime configuration identity");
    }
    const facet = options.runtimeImplementation.facet;
    if (!facet.name.trim() || !facet.module.name.trim() || !facet.module.version.trim()) {
      throw new Error("Endpoint runtime implementation facet is invalid");
    }
    const duplicate = this.#registrations.some((candidate) =>
      candidate.id === id && sameRef(candidate.capability, capability));
    if (duplicate) throw new Error(`endpoint ${id} already registers ${endpointCapabilityKey(capability)}`);
    this.#registrations.push({ kind: "recoverable", id, capability, returns, endpoint, ...options });
  }

  runtimeClosureDigest(): Digest | undefined {
    return this.#runtimeClosure;
  }

  /** Bind only implementation-verified Endpoint instances from one locked Runtime Closure. */
  applyRuntimeClosure(
    closure: RuntimeClosure,
    modules: RuntimeModuleRegistry,
  ): void {
    modules.verifyClosure(closure);
    if (this.#runtimeClosure !== undefined && this.#runtimeClosure !== closure.digest) {
      throw new Error("Endpoint Registry is already bound to another Runtime Closure");
    }
    const pending: { readonly key: string; readonly endpoint: string; readonly scheduling: SchedulingHint }[] = [];
    for (const binding of closure.endpoints) {
      const endpoint = runtimeEndpoint(closure, binding.endpoint);
      if (endpoint === undefined) throw new Error(`Runtime Endpoint ${binding.endpoint} is unavailable`);
      const registration = this.#registrations.find((candidate) =>
        candidate.id === endpoint.id
        && sameRef(candidate.capability, binding.capability)
        && sameRef(candidate.returns, binding.returns));
      if (registration === undefined) {
        throw new Error(`Endpoint ${endpoint.id} is not registered for ${endpointCapabilityKey(binding.capability)}`);
      }
      const expectedKind = endpoint.lifecycle;
      if (registration.kind !== expectedKind) {
        throw new Error(`Endpoint ${endpoint.id} lifecycle does not match the Runtime Closure`);
      }
      const implementation = registration.runtimeImplementation;
      if (implementation === undefined
        || implementation.digest !== endpoint.implementation.digest
        || implementation.configurationDigest !== endpoint.configurationDigest
        || !sameRef(implementation.facet, endpoint.facet)) {
        throw new Error(`Endpoint ${endpoint.id} implementation does not match the Runtime Closure`);
      }
      const credentialSlots = Object.keys(registration.credentials ?? {}).sort();
      if (JSON.stringify(credentialSlots) !== JSON.stringify(endpoint.credentialSlots)) {
        throw new Error(`Endpoint ${endpoint.id} credential slots do not match the Runtime Closure`);
      }
      const route = endpoint.routes.find((item) =>
        sameRef(item.capability, binding.capability) && sameRef(item.returns, binding.returns));
      if (route === undefined) throw new Error(`Endpoint ${endpoint.id} has no locked scheduling route`);
      const scheduling = {
        queue: { authority: endpoint.authority, route: route.route },
        resources: [
          {
            id: `authority:${endpoint.authority}`,
            maxActive: endpoint.maxConcurrency,
            maxInFlight: endpoint.maxConcurrency,
          },
          {
            id: `route:${endpoint.authority}/${route.route}`,
            maxActive: route.maxConcurrency,
            maxInFlight: route.maxConcurrency,
          },
        ],
      };
      pending.push({
        key: endpointCapabilityKey(binding.capability),
        endpoint: endpoint.id,
        scheduling,
      });
    }
    for (const item of pending) {
      this.#bindings.set(item.key, item.endpoint);
      this.#runtimeScheduling.set(`${item.endpoint}\n${item.key}`, item.scheduling);
    }
    this.#runtimeClosure = closure.digest;
  }

  resolve(need: Need): EndpointResolution {
    const key = endpointCapabilityKey(need.capability);
    const bound = this.#bindings.get(key);
    const registrations = this.#registrations.filter((registration) =>
      sameRef(registration.capability, need.capability)
      && sameRef(registration.returns, need.returns)
      && (registration.supports?.(need) ?? true));
    if (bound !== undefined) {
      const registration = registrations.find((candidate) => candidate.id === bound);
      const scheduling = registration === undefined
        ? undefined
        : this.#runtimeScheduling.get(`${registration.id}\n${key}`) ?? registration.scheduling;
      return registration === undefined
        ? { status: "missing", endpointId: bound }
        : {
            status: "resolved",
            registration: scheduling === undefined ? registration : { ...registration, scheduling },
          };
    }
    if (registrations.length === 0) return { status: "missing" };
    if (registrations.length > 1) {
      return {
        status: "ambiguous",
        endpointIds: registrations.map((registration) => registration.id).sort(),
      };
    }
    const registration = registrations[0]!;
    const scheduling = this.#runtimeScheduling.get(`${registration.id}\n${key}`) ?? registration.scheduling;
    return {
      status: "resolved",
      registration: scheduling === undefined ? registration : { ...registration, scheduling },
    };
  }

}
