import type {
  BuildState,
  CoreCommand,
  TypeRef,
  CapabilityRef,
} from "@hypit/protocol";
import type {
  ProducerHandler,
} from "@hypit/component-kit";
import type { EndpointRegistrationOptions, EndpointScheduling, ImmediateEndpointHandler, AsyncEndpoint } from "@hypit/endpoint-kit";

export type {
  ProducerHandler,
  ProducerHandlerContext,
  ProducerHandlerResult,
  ProducerRegistrar,
} from "@hypit/component-kit";

export type DriverExecutionOutcome = {
  readonly command: string;
  readonly kind: CoreCommand["kind"];
  readonly status: "completed" | "pending" | "error";
  readonly operation?: string;
  readonly wakeAt?: number;
  readonly message?: string;
};

export type BlockedCommand = {
  readonly command: string;
  readonly reason:
    | "missing-producer"
    | "missing-endpoint"
    | "ambiguous-endpoint"
    | "missing-operation-store";
  readonly subject: string;
};

export type DriverRunResult = {
  readonly status: "complete" | "paused" | "failed";
  readonly state: BuildState;
  readonly outcomes: readonly DriverExecutionOutcome[];
  readonly blocked: readonly BlockedCommand[];
};

export type ProducerRegistration = {
  readonly handler: ProducerHandler;
  readonly scheduling?: EndpointScheduling;
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

export type EndpointResolution =
  | { readonly status: "resolved"; readonly registration: EndpointRegistration }
  | { readonly status: "missing"; readonly endpointId?: string }
  | { readonly status: "ambiguous"; readonly endpointIds: readonly string[] };
