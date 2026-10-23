import type {
  EndpointDemand,
  EndpointRequest,
  EndpointRegistrar,
  EndpointRegistrationOptions,
  EndpointScheduling,
  ImmediateEndpointHandler,
  AsyncEndpoint,
} from "@hypit/endpoint";
import type {
  ProducerRegistrar,
} from "@hypit/producer";
import type { CapabilityRef, ProducerRef, TypeRef } from "@hypit/protocol";
import {
  capabilityIdentity,
  capabilityKey,
  compareCodeUnits,
  producerIdentity,
  producerKey,
  sameCapability,
  sameType,
} from "@hypit/protocol";
import { capacityUnits, verifyCredentialRef } from "@hypit/runtime";

import type {
  ProducerHandler,
  EndpointRegistration,
  EndpointSelection,
} from "./types.js";

function verifyScheduling(scheduling: EndpointScheduling | undefined): void {
  if (scheduling === undefined) return;
  if (scheduling.resources.length === 0) throw new Error("scheduling resources must not be empty");
  for (const resources of [scheduling.resources, ...Object.values(scheduling.actions ?? {})]) {
    const ids = resources.map((resource) => {
      capacityUnits(resource);
      return resource.id;
    });
    if (new Set(ids).size !== ids.length) throw new Error("scheduling resources contain duplicate ids");
  }
  if (scheduling.resources.some((resource) => resource.periodMs !== undefined)) {
    throw new Error("Rate budgets apply to Endpoint actions; whole-operation resources declare occupancy");
  }
}

export class ProducerRegistry implements ProducerRegistrar {
  readonly #producers = new Map<string, ProducerHandler>();

  registerProducer(producer: ProducerRef, handler: ProducerHandler): void {
    const identity = producerIdentity(producer);
    const display = producerKey(producer);
    if (this.#producers.has(identity)) throw new Error(`producer ${display} is already registered`);
    this.#producers.set(identity, handler);
  }

  producer(ref: ProducerRef): ProducerHandler | undefined {
    return this.#producers.get(producerIdentity(ref));
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

/** Endpoint support checks always receive the concrete request emitted by a completed Producer. */

export class EndpointRegistry implements EndpointRegistrar {
  readonly #registrations: EndpointRegistration[] = [];
  readonly #registrationKeys = new Set<string>();
  readonly #registrationsByCapability = new Map<string, EndpointRegistration[]>();
  readonly #bindings = new Map<string, string>();

  /**
   * Decide which Endpoint serves a capability that several Endpoints offer. Providers declare
   * everything they can do; the deployment that selected them says who does it.
   */
  bind(capability: CapabilityRef, endpointId: string): void {
    if (!endpointId.trim()) throw new Error("binding endpoint id must not be empty");
    this.#bindings.set(capabilityIdentity(capability), endpointId);
  }

  /** Endpoint instance ids that registered at least one capability. */
  endpointIds(): readonly string[] {
    return [...new Set(this.#registrations.map((registration) => registration.id))].sort();
  }

  /**
   * Shared capacity resources that different registrations size differently. Two Endpoints in one
   * pool with different concurrency would otherwise only collide inside the scheduler, mid-Build.
   */
  capacityConflicts(): readonly { readonly resource: string; readonly limits: readonly number[]; readonly settings: readonly string[]; readonly endpointIds: readonly string[] }[] {
    const resources = new Map<string, Map<string, { limit: number; endpoints: Set<string> }>>();
    for (const registration of this.#registrations) {
      const scheduling = registration.scheduling;
      for (const resource of [...(scheduling?.resources ?? []), ...Object.values(scheduling?.actions ?? {}).flat()]) {
        const settings = resource.periodMs === undefined ? `${resource.limit} concurrent` : `${resource.limit} per ${resource.periodMs} ms`;
        const variants = resources.get(resource.id) ?? new Map();
        const variant = variants.get(settings) ?? { limit: resource.limit, endpoints: new Set<string>() };
        variant.endpoints.add(registration.id);
        variants.set(settings, variant);
        resources.set(resource.id, variants);
      }
    }
    return [...resources.entries()].filter(([, variants]) => variants.size > 1).map(([resource, variants]) => ({
      resource,
      limits: [...new Set([...variants.values()].map((variant) => variant.limit))].sort((a, b) => a - b),
      settings: [...variants.keys()].sort(compareCodeUnits),
      endpointIds: [...new Set([...variants.values()].flatMap((variant) => [...variant.endpoints]))].sort(),
    })).sort((a, b) => compareCodeUnits(a.resource, b.resource));
  }

  /** Capabilities offered by more than one Endpoint, with the ids, for a deployment to bind. */
  contested(): readonly { readonly capability: CapabilityRef; readonly endpointIds: readonly string[]; readonly bound?: string }[] {
    const found: { readonly capability: CapabilityRef; readonly endpointIds: readonly string[]; readonly bound?: string }[] = [];
    for (const [key, registrations] of this.#registrationsByCapability) {
      const ids = [...new Set(registrations.map((registration) => registration.id))].sort();
      if (ids.length < 2) continue;
      const bound = this.#bindings.get(key);
      found.push({ capability: registrations[0]!.capability, endpointIds: ids, ...(bound === undefined ? {} : { bound }) });
    }
    return found.sort((left, right) => compareCodeUnits(capabilityKey(left.capability), capabilityKey(right.capability)));
  }

  registerImmediateEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    handler: ImmediateEndpointHandler,
    options: EndpointOptions = {},
  ): void {
    if (!id.trim()) throw new Error("endpoint id must not be empty");
    verifyEndpointOptions(options);
    const capabilityId = capabilityIdentity(capability);
    const key = JSON.stringify([id, capabilityId]);
    if (this.#registrationKeys.has(key)) throw new Error(`endpoint ${id} already registers ${capabilityKey(capability)}`);
    const registration = { kind: "immediate" as const, id, capability, returns, handler, ...options };
    this.#registrationKeys.add(key);
    this.#registrations.push(registration);
    const registrations = this.#registrationsByCapability.get(capabilityId) ?? [];
    registrations.push(registration);
    this.#registrationsByCapability.set(capabilityId, registrations);
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
    const capabilityId = capabilityIdentity(capability);
    const key = JSON.stringify([id, capabilityId]);
    if (this.#registrationKeys.has(key)) throw new Error(`endpoint ${id} already registers ${capabilityKey(capability)}`);
    const registration = { kind: "asynchronous" as const, id, capability, returns, endpoint, ...options };
    this.#registrationKeys.add(key);
    this.#registrations.push(registration);
    const registrations = this.#registrationsByCapability.get(capabilityId) ?? [];
    registrations.push(registration);
    this.#registrationsByCapability.set(capabilityId, registrations);
  }

  select(demand: EndpointDemand): EndpointSelection {
    const key = capabilityIdentity(demand.capability);
    const registrations = (this.#registrationsByCapability.get(key) ?? [])
      .filter((registration) => sameType(registration.returns, demand.returns));
    const bound = this.#bindings.get(key);
    if (bound !== undefined) {
      const chosen = registrations.find((registration) => registration.id === bound);
      if (chosen === undefined) return { status: "missing", endpointId: bound };
      return { status: "resolved", registration: chosen };
    }
    if (registrations.length === 0) return { status: "missing" };
    if (registrations.length > 1) {
      return {
        status: "ambiguous",
        endpointIds: [...new Set(registrations.map((registration) => registration.id))].sort(),
      };
    }
    return { status: "resolved", registration: registrations[0]! };
  }

  /** Support belongs to one already selected deployment and one concrete request. */
  checkSupport(registration: EndpointRegistration, request: EndpointRequest) {
    if (!sameCapability(registration.capability, request.capability) || !sameType(registration.returns, request.returns)) {
      throw new Error(`Endpoint ${registration.id} cannot check support for another demand`);
    }
    const support = registration.supports?.(request) ?? { status: "supported" as const };
    if (support.status === "unsupported" && !support.reason.trim()) {
      throw new Error(`Endpoint ${registration.id} returned an empty unsupported reason`);
    }
    return support;
  }

}
