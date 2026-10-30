import type { TypeRef, CapabilityRef } from "@hypit/protocol";
import type { EndpointRegistrationOptions, ImmediateEndpointHandler, AsyncEndpoint } from "@hypit/endpoint";

export type { RuntimeBlockedCommand as BlockedCommand } from "@hypit/runtime";

export type {
  ProducerHandler,
  ProducerHandlerContext,
  ProducerHandlerResult,
  ProducerExecutionLimits,
  ProducerRegistrar,
} from "@hypit/producer";

type EndpointRegistrationBase = {
  readonly id: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
} & EndpointRegistrationOptions;

export type EndpointRegistration = EndpointRegistrationBase & (
  | { readonly kind: "immediate"; readonly handler: ImmediateEndpointHandler }
  | { readonly kind: "asynchronous"; readonly endpoint: AsyncEndpoint }
);

/** Deployment selection depends only on capability, return Type and explicit Profile binding. */
export type EndpointSelection =
  | { readonly status: "resolved"; readonly registration: EndpointRegistration }
  | { readonly status: "missing"; readonly endpointId?: string }
  | { readonly status: "ambiguous"; readonly endpointIds: readonly string[] };
