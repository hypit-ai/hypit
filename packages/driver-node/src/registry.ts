import type {
  EndpointRegistrar,
  EndpointRegistrationOptions,
  EndpointScheduling,
  ImmediateEndpointHandler,
  AsyncEndpoint,
} from "@hypit/endpoint-kit";
import type {
  ProducerRegistrar,
} from "@hypit/component-kit";
import type {
  CapabilityRef,
  Need,
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import { verifyCredentialRef } from "@hypit/runtime";

import type {
  ProducerHandler,
  ProducerRegistration,
  EndpointRegistration,
  EndpointResolution,
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

function verifyScheduling(scheduling: EndpointScheduling | undefined): void {
  if (scheduling === undefined) return;
  if (scheduling.resources.length === 0) throw new Error("scheduling resources must not be empty");
  const ids = scheduling.resources.map((resource) => {
    if (resource.id.trim().length === 0) throw new Error("scheduling resource id must not be empty");
    if (!Number.isSafeInteger(resource.limit) || resource.limit < 1) {
      throw new Error(`scheduling resource ${resource.id} limit must be a positive safe integer`);
    }
    return resource.id;
  });
  if (new Set(ids).size !== ids.length) throw new Error("scheduling resources contain duplicate ids");
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
    options: { readonly scheduling?: EndpointScheduling } = {},
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

/**
 * A Need, or the declared shape of one before its constraints exist.
 *
 * `plan` resolves capabilities before any request has been built, so it may leave `constraints`
 * out; an Endpoint's `supports` refinement is then not consulted and several candidates stay
 * ambiguous until the Profile binds one or the constraints arrive.
 */
export type ResolvableNeed = Pick<Need, "capability"> & Partial<Omit<Need, "capability">>;

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
    this.#bindings.set(endpointCapabilityKey(capability), endpointId);
  }

  /** Endpoint instance ids that registered at least one capability. */
  endpointIds(): readonly string[] {
    return [...new Set(this.#registrations.map((registration) => registration.id))].sort();
  }

  /**
   * Shared capacity resources that different registrations size differently. Two Endpoints in one
   * pool with different concurrency would otherwise only collide inside the scheduler, mid-Build.
   */
  capacityConflicts(): readonly { readonly resource: string; readonly limits: readonly number[]; readonly endpointIds: readonly string[] }[] {
    const limits = new Map<string, Map<number, Set<string>>>();
    for (const registration of this.#registrations) {
      for (const resource of registration.scheduling?.resources ?? []) {
        const byLimit = limits.get(resource.id) ?? new Map<number, Set<string>>();
        const ids = byLimit.get(resource.limit) ?? new Set<string>();
        ids.add(registration.id);
        byLimit.set(resource.limit, ids);
        limits.set(resource.id, byLimit);
      }
    }
    return [...limits.entries()]
      .filter(([, byLimit]) => byLimit.size > 1)
      .map(([resource, byLimit]) => ({
        resource,
        limits: [...byLimit.keys()].sort((left, right) => left - right),
        endpointIds: [...new Set([...byLimit.values()].flatMap((ids) => [...ids]))].sort(),
      }))
      .sort((left, right) => left.resource.localeCompare(right.resource));
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
    return found.sort((left, right) => endpointCapabilityKey(left.capability).localeCompare(endpointCapabilityKey(right.capability)));
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

  resolve(need: ResolvableNeed): EndpointResolution {
    const key = endpointCapabilityKey(need.capability);
    const registrations = (this.#registrationsByCapability.get(key) ?? []).filter((registration) =>
      (need.returns === undefined || sameRef(registration.returns, need.returns))
      && (need.constraints === undefined || (registration.supports?.(need as Need) ?? true)));
    const bound = this.#bindings.get(key);
    if (bound !== undefined) {
      const chosen = registrations.find((registration) => registration.id === bound);
      // A binding names the Endpoint; an Endpoint that cannot serve this request is a missing one,
      // reported with the id so the deployment sees which binding to revisit.
      return chosen === undefined ? { status: "missing", endpointId: bound } : { status: "resolved", registration: chosen };
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

}
