import type { TypeRef, CapabilityRef } from "@hypit/protocol";
import type {
  ProducerHandler,
} from "@hypit/producer";
import type { EndpointRegistrationOptions, ImmediateEndpointHandler, AsyncEndpoint } from "@hypit/endpoint";

export type {
  ProducerHandler,
  ProducerHandlerContext,
  ProducerHandlerResult,
  ProducerRegistrar,
} from "@hypit/producer";

export type BlockedCommand = {
  readonly command: string;
  readonly reason:
    | "missing-producer"
    | "missing-endpoint"
    | "unsupported-endpoint-request"
    | "ambiguous-endpoint"
    | "missing-operation-store";
  readonly subject: string;
};

export type ProducerRegistration = {
  readonly handler: ProducerHandler;
};

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
