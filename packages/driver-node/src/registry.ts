import type {
  EndpointRegistrar,
  EndpointRegistrationOptions,
  ImmediateEndpointHandler,
  AsyncEndpoint,
} from "@narratage/endpoint-kit";
import type {
  ProducerRegistrar,
} from "@narratage/component-kit";
import type {
  CapabilityRef,
  Need,
  ProducerRef,
  TypeRef,
} from "@narratage/protocol";
import { verifyCredentialRef } from "@narratage/runtime";

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
    && (scheduling.queue.pool.trim().length === 0 || scheduling.queue.lane.trim().length === 0)) {
    throw new Error("scheduling queue pool and lane must not be empty");
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
    handler: ProducerHandler,
    options: { readonly scheduling?: SchedulingHint } = {},
  ): void {
    const key = producerRegistryKey(producer);
    if (this.#producers.has(key)) throw new Error(`producer ${key} is already registered`);
    verifyScheduling(options.scheduling);
    this.#producers.set(key, { handler, ...options });
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
}

export class EndpointRegistry implements EndpointRegistrar {
  readonly #registrations: EndpointRegistration[] = [];
  readonly #registrationKeys = new Set<string>();
  readonly #registrationsByCapability = new Map<string, EndpointRegistration[]>();

  registerImmediateEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    handler: ImmediateEndpointHandler,
    options: EndpointOptions = {},
  ): void {
    if (!id.trim()) throw new Error("endpoint id must not be empty");
    verifyEndpointOptions(options);
    const key = `${id}\n${endpointCapabilityKey(capability)}`;
    if (this.#registrationKeys.has(key)) throw new Error(`endpoint ${id} already registers ${endpointCapabilityKey(capability)}`);
    const registration = { kind: "immediate" as const, id, capability, returns, handler, ...options };
    this.#registrationKeys.add(key);
    this.#registrations.push(registration);
    const registrations = this.#registrationsByCapability.get(endpointCapabilityKey(capability)) ?? [];
    registrations.push(registration);
    this.#registrationsByCapability.set(endpointCapabilityKey(capability), registrations);
  }

  registerAsyncEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    endpoint: AsyncEndpoint,
    options: EndpointOptions = {},
  ): void {
    if (!id.trim()) throw new Error("endpoint id must not be empty");
    verifyEndpointOptions(options);
    const key = `${id}\n${endpointCapabilityKey(capability)}`;
    if (this.#registrationKeys.has(key)) throw new Error(`endpoint ${id} already registers ${endpointCapabilityKey(capability)}`);
    const registration = { kind: "asynchronous" as const, id, capability, returns, endpoint, ...options };
    this.#registrationKeys.add(key);
    this.#registrations.push(registration);
    const registrations = this.#registrationsByCapability.get(endpointCapabilityKey(capability)) ?? [];
    registrations.push(registration);
    this.#registrationsByCapability.set(endpointCapabilityKey(capability), registrations);
  }

  resolve(need: Need): EndpointResolution {
    const key = endpointCapabilityKey(need.capability);
    const registrations = (this.#registrationsByCapability.get(key) ?? []).filter((registration) =>
      sameRef(registration.returns, need.returns)
      && (registration.supports?.(need) ?? true));
    if (registrations.length === 0) return { status: "missing" };
    if (registrations.length > 1) {
      return {
        status: "ambiguous",
        endpointIds: registrations.map((registration) => registration.id).sort(),
      };
    }
    return { status: "resolved", registration: registrations[0]! };
  }

}
