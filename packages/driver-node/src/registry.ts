import type {
  EndpointRequest,
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
  ProducerRef,
  TypeRef,
} from "@hypit/protocol";
import { capacityUnits, verifyCredentialRef } from "@hypit/runtime";

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
 * Endpoint selection always receives the complete support-relevant request. Upstream graph values
 * may still be pending, but the package that declares the request exposes their semantic slots.
 */

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
      settings: [...variants.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
      endpointIds: [...new Set([...variants.values()].flatMap((variant) => [...variant.endpoints]))].sort(),
    })).sort((a, b) => a.resource.localeCompare(b.resource));
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

  resolve(need: EndpointRequest): EndpointResolution {
    const key = endpointCapabilityKey(need.capability);
    const registrations = (this.#registrationsByCapability.get(key) ?? [])
      .filter((registration) => sameRef(registration.returns, need.returns));
    const bound = this.#bindings.get(key);
    if (bound !== undefined) {
      const chosen = registrations.find((registration) => registration.id === bound);
      if (chosen === undefined) return { status: "missing", endpointId: bound };
      const support = chosen.supports?.(need) ?? { status: "supported" };
      if (support.status === "unsupported") {
        if (!support.reason.trim()) throw new Error(`Endpoint ${chosen.id} returned an empty unsupported reason`);
        return { status: "unsupported", rejections: [{ endpointId: chosen.id, reason: support.reason }] };
      }
      return { status: "resolved", registration: chosen };
    }
    if (registrations.length === 0) return { status: "missing" };
    const supported: EndpointRegistration[] = [];
    const rejections: { endpointId: string; reason: string }[] = [];
    for (const registration of registrations) {
      const support = registration.supports?.(need) ?? { status: "supported" };
      if (support.status === "supported") {
        supported.push(registration);
      } else {
        if (!support.reason.trim()) throw new Error(`Endpoint ${registration.id} returned an empty unsupported reason`);
        rejections.push({ endpointId: registration.id, reason: support.reason });
      }
    }
    if (supported.length === 0) {
      return { status: "unsupported", rejections: rejections.sort((left, right) => left.endpointId.localeCompare(right.endpointId)) };
    }
    if (supported.length > 1) {
      return {
        status: "ambiguous",
        endpointIds: [...new Set(supported.map((registration) => registration.id))].sort(),
      };
    }
    return { status: "resolved", registration: supported[0]! };
  }

}
