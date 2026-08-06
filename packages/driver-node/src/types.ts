import type {
  BuildState,
  CanonicalValue,
  Conformance,
  CoreCommand,
  Delivery,
  Digest,
  FulfillNeedCommand,
  Need,
  ProducerRef,
  StoredValue,
  TypeRef,
  CapabilityRef,
} from "@svml/protocol";
import type {
  ProducerHandler,
} from "@svml/component-kit";
import type {
  ArtifactStore,
  CredentialRef,
  CredentialValue,
  OperationIdentity,
  OperationFailure,
  RuntimeFacetRef,
} from "@svml/runtime";

export type { ArtifactStore } from "@svml/runtime";

export type {
  ProducerHandler,
  ProducerHandlerContext,
  ProducerHandlerResult,
  ProducerRegistrar,
} from "@svml/component-kit";

export type ProviderHandlerResult = {
  readonly value: StoredValue;
  readonly conformance: Conformance;
  readonly delivery: Delivery;
  readonly metadata: CanonicalValue;
};

export type ProviderHandlerContext = {
  readonly command: FulfillNeedCommand;
  readonly need: Need;
  readonly artifacts: ArtifactStore;
  /** Only slots explicitly declared by this configured Provider instance are present. */
  readonly credentials: Readonly<Record<string, CredentialValue>>;
};

export type ProviderHandler = (
  context: ProviderHandlerContext,
) => ProviderHandlerResult | Promise<ProviderHandlerResult>;

export type ProviderEndpointResult =
  | { readonly status: "pending"; readonly checkpoint: CanonicalValue; readonly wakeAt?: number }
  | { readonly status: "completed"; readonly result: ProviderHandlerResult }
  | { readonly status: "failed"; readonly failure: OperationFailure };

export type ProviderEndpointStartContext = ProviderHandlerContext & {
  readonly operation: OperationIdentity;
};

export type ProviderEndpointResumeContext = ProviderEndpointStartContext & {
  /** Undefined means the process stopped after intent was journaled but before a checkpoint existed. */
  readonly checkpoint: CanonicalValue | undefined;
};

export type ProviderEndpoint = {
  start(context: ProviderEndpointStartContext): ProviderEndpointResult | Promise<ProviderEndpointResult>;
  resume(context: ProviderEndpointResumeContext): ProviderEndpointResult | Promise<ProviderEndpointResult>;
  cancel?(context: ProviderEndpointResumeContext): void | Promise<void>;
};

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
    | "missing-provider"
    | "ambiguous-provider"
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
export type SchedulingHint = {
  readonly lane?: string;
  readonly maxConcurrency?: number;
};

export type ProviderRetryPolicy = {
  /** Includes the first submission. A new attempt receives a new submission key. */
  readonly maxAttempts: number;
};

export type RuntimeProviderImplementation = {
  readonly facet: RuntimeFacetRef;
  readonly digest: Digest;
  /** Identity of the configured endpoint instance; secret values are never part of it. */
  readonly configurationDigest: Digest;
};

export type ProducerRegistration = {
  readonly producer: ProducerRef;
  readonly implementationDigest: Digest;
  readonly handler: ProducerHandler;
  readonly scheduling?: SchedulingHint;
};

type ProviderRegistrationBase = {
  readonly id: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly supports?: (need: Need) => boolean;
  readonly scheduling?: SchedulingHint;
  readonly runtimeImplementation?: RuntimeProviderImplementation;
  readonly credentials?: Readonly<Record<string, CredentialRef>>;
  readonly retry?: ProviderRetryPolicy;
};

export type ProviderRegistration = ProviderRegistrationBase & (
  | { readonly kind: "handler"; readonly handler: ProviderHandler }
  | { readonly kind: "endpoint"; readonly endpoint: ProviderEndpoint }
);

export type ProviderResolution =
  | { readonly status: "resolved"; readonly registration: ProviderRegistration }
  | { readonly status: "missing"; readonly providerId?: string }
  | { readonly status: "ambiguous"; readonly providerIds: readonly string[] };
