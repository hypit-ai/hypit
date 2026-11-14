import type {
  AsyncEndpoint,
  EndpointDemand,
  EndpointRegistrationOptions,
  EndpointRequest,
  EndpointRegistrar,
  EndpointScheduling,
  ImmediateEndpointHandler,
} from "./index.js";
import type { CapabilityRef, TypeRef } from "@hypit/module";
import { compareCodeUnits } from "@hypit/protocol";
import { capabilityIdentity, capabilityKey, sameCapability, sameType } from "@hypit/module";
import { capacityUnits, verifyCredentialRef } from "@hypit/execution-environment";

type EndpointRegistrationBase = {
  readonly id: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
} & EndpointRegistrationOptions;

export type EndpointRegistration = EndpointRegistrationBase & (
  | { readonly kind: "immediate"; readonly handler: ImmediateEndpointHandler }
  | { readonly kind: "asynchronous"; readonly endpoint: AsyncEndpoint }
);

export type EndpointSelection =
  | { readonly status: "resolved"; readonly registration: EndpointRegistration }
  | { readonly status: "missing"; readonly endpointId?: string }
  | { readonly status: "ambiguous"; readonly endpointIds: readonly string[] };

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

function verifyEndpointOptions(options: EndpointRegistrationOptions): void {
  verifyScheduling(options.scheduling);
  for (const [slot, ref] of Object.entries(options.credentials ?? {})) {
    if (slot.trim().length === 0) throw new Error("Endpoint credential slot must not be empty");
    verifyCredentialRef(ref);
  }
}

/** Deployment-owned Endpoint installation, binding and request support. */
export class EndpointRegistry implements EndpointRegistrar {
  readonly #registrations: EndpointRegistration[] = [];
  readonly #registrationKeys = new Set<string>();
  readonly #registrationsByCapability = new Map<string, EndpointRegistration[]>();
  readonly #bindings = new Map<string, string>();

  bind(capability: CapabilityRef, endpointId: string): void {
    if (!endpointId.trim()) throw new Error("binding endpoint id must not be empty");
    this.#bindings.set(capabilityIdentity(capability), endpointId);
  }

  endpointIds(): readonly string[] {
    return [...new Set(this.#registrations.map((registration) => registration.id))].sort();
  }

  capacityConflicts(): readonly {
    readonly resource: string;
    readonly limits: readonly number[];
    readonly settings: readonly string[];
    readonly endpointIds: readonly string[];
  }[] {
    const resources = new Map<string, Map<string, { limit: number; endpoints: Set<string> }>>();
    for (const registration of this.#registrations) {
      const scheduling = registration.scheduling;
      for (const resource of [...(scheduling?.resources ?? []), ...Object.values(scheduling?.actions ?? {}).flat()]) {
        const settings = resource.periodMs === undefined
          ? `${resource.limit} concurrent`
          : `${resource.limit} per ${resource.periodMs} ms`;
        const variants = resources.get(resource.id) ?? new Map();
        const variant = variants.get(settings) ?? { limit: resource.limit, endpoints: new Set<string>() };
        variant.endpoints.add(registration.id);
        variants.set(settings, variant);
        resources.set(resource.id, variants);
      }
    }
    return [...resources.entries()].filter(([, variants]) => variants.size > 1).map(([resource, variants]) => ({
      resource,
      limits: [...new Set([...variants.values()].map((variant) => variant.limit))].sort((left, right) => left - right),
      settings: [...variants.keys()].sort(compareCodeUnits),
      endpointIds: [...new Set([...variants.values()].flatMap((variant) => [...variant.endpoints]))].sort(),
    })).sort((left, right) => compareCodeUnits(left.resource, right.resource));
  }

  contested(): readonly {
    readonly capability: CapabilityRef;
    readonly endpointIds: readonly string[];
    readonly bound?: string;
  }[] {
    const found: { readonly capability: CapabilityRef; readonly endpointIds: readonly string[]; readonly bound?: string }[] = [];
    for (const [key, registrations] of this.#registrationsByCapability) {
      const endpointIds = [...new Set(registrations.map((registration) => registration.id))].sort();
      if (endpointIds.length < 2) continue;
      const bound = this.#bindings.get(key);
      found.push({ capability: registrations[0]!.capability, endpointIds, ...(bound === undefined ? {} : { bound }) });
    }
    return found.sort((left, right) => compareCodeUnits(capabilityKey(left.capability), capabilityKey(right.capability)));
  }

  registerImmediateEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    handler: ImmediateEndpointHandler,
    options: EndpointRegistrationOptions = {},
  ): void {
    this.#register({ kind: "immediate", id, capability, returns, handler, ...options });
  }

  registerAsyncEndpoint(
    id: string,
    capability: CapabilityRef,
    returns: TypeRef,
    endpoint: AsyncEndpoint,
    options: EndpointRegistrationOptions = {},
  ): void {
    this.#register({ kind: "asynchronous", id, capability, returns, endpoint, ...options });
  }

  #register(registration: EndpointRegistration): void {
    if (!registration.id.trim()) throw new Error("endpoint id must not be empty");
    verifyEndpointOptions(registration);
    const capabilityId = capabilityIdentity(registration.capability);
    const key = JSON.stringify([registration.id, capabilityId]);
    if (this.#registrationKeys.has(key)) {
      throw new Error(`endpoint ${registration.id} already registers ${capabilityKey(registration.capability)}`);
    }
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
      const registration = registrations.find((candidate) => candidate.id === bound);
      return registration === undefined
        ? { status: "missing", endpointId: bound }
        : { status: "resolved", registration };
    }
    if (registrations.length === 0) return { status: "missing" };
    if (registrations.length > 1) {
      return { status: "ambiguous", endpointIds: [...new Set(registrations.map((item) => item.id))].sort() };
    }
    return { status: "resolved", registration: registrations[0]! };
  }

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
