import type {
  BuildState,
  CoreCommand,
  Digest,
  ProducerRef,
  TypeRef,
  CapabilityRef,
} from "@narratage/protocol";
import type {
  ProducerHandler,
} from "@narratage/component-kit";
import type { EndpointRegistrationOptions, EndpointScheduling, ImmediateEndpointHandler, RecoverableEndpoint } from "@narratage/endpoint-kit";

export type { ArtifactStore } from "@narratage/runtime";

export type {
  ProducerHandler,
  ProducerHandlerContext,
  ProducerHandlerResult,
  ProducerRegistrar,
} from "@narratage/component-kit";

export type DriverJournalEntry = {
  readonly command: string;
  readonly kind: CoreCommand["kind"];
  readonly status: "completed" | "pending" | "blocked" | "error";
  readonly event?: string;
  readonly operation?: Digest;
  readonly wakeAt?: number;
  readonly message?: string;
};

export type BlockedCommand = {
  readonly command: string;
  readonly reason:
    | "missing-producer"
    | "implementation-mismatch"
    | "missing-endpoint"
    | "ambiguous-endpoint"
    | "missing-operation-store"
    | "missing-runtime-closure";
  readonly subject: string;
};

export type DriverRunResult = {
  readonly status: "complete" | "paused" | "failed";
  readonly state: BuildState;
  readonly journal: readonly DriverJournalEntry[];
  readonly blocked: readonly BlockedCommand[];
};

/** Endpoint/implementation scheduling metadata; it never changes Core demand or command identity. */
export type SchedulingHint = EndpointScheduling;

export type ProducerRegistration = {
  readonly producer: ProducerRef;
  readonly implementationDigest: Digest;
  readonly handler: ProducerHandler;
  readonly scheduling?: SchedulingHint;
};

type EndpointRegistrationBase = {
  readonly id: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
} & EndpointRegistrationOptions;

export type EndpointRegistration = EndpointRegistrationBase & (
  | { readonly kind: "immediate"; readonly handler: ImmediateEndpointHandler }
  | { readonly kind: "recoverable"; readonly endpoint: RecoverableEndpoint }
);

export type EndpointResolution =
  | { readonly status: "resolved"; readonly registration: EndpointRegistration }
  | { readonly status: "missing"; readonly endpointId?: string }
  | { readonly status: "ambiguous"; readonly endpointIds: readonly string[] };
