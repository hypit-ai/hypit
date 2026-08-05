import type {
  BlobRef,
  BuildState,
  CanonicalValue,
  Conformance,
  CoreCommand,
  Delivery,
  Digest,
  FulfillNeedCommand,
  InvokeProducerCommand,
  Need,
  ProducerRef,
  StoredValue,
  TypeRef,
  CapabilityRef,
  TypedRecord,
} from "@svml/protocol";
import type {
  OperationIdentity,
  RuntimeFacetRef,
} from "@svml/runtime";

export type ProducerHandlerResult = {
  readonly outputs: Readonly<Record<string, StoredValue>>;
  readonly needs: Readonly<Record<string, CanonicalValue>>;
};

export type ProducerHandlerContext = {
  readonly command: InvokeProducerCommand;
  readonly producer: ProducerRef;
  readonly inputs: Readonly<Record<string, TypedRecord>>;
  readonly artifacts: ArtifactStore;
};

export type ProducerHandler = (
  context: ProducerHandlerContext,
) => ProducerHandlerResult | Promise<ProducerHandlerResult>;

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
};

export type ProviderHandler = (
  context: ProviderHandlerContext,
) => ProviderHandlerResult | Promise<ProviderHandlerResult>;

export type ProviderEndpointResult =
  | { readonly status: "pending"; readonly checkpoint: CanonicalValue }
  | { readonly status: "completed"; readonly result: ProviderHandlerResult };

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

export type ArtifactStore = {
  put(bytes: Uint8Array, mediaType: string): Promise<BlobRef>;
  get(digest: Digest): Promise<Uint8Array | undefined>;
  has(digest: Digest): Promise<boolean>;
};

export type DriverJournalEntry = {
  readonly command: string;
  readonly kind: CoreCommand["kind"];
  readonly status: "completed" | "pending" | "blocked" | "error";
  readonly event?: string;
  readonly operation?: Digest;
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

export type RuntimeProviderImplementation = {
  readonly facet: RuntimeFacetRef;
  readonly digest: Digest;
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
};

export type ProviderRegistration = ProviderRegistrationBase & (
  | { readonly kind: "handler"; readonly handler: ProviderHandler }
  | { readonly kind: "endpoint"; readonly endpoint: ProviderEndpoint }
);

export type ProviderResolution =
  | { readonly status: "resolved"; readonly registration: ProviderRegistration }
  | { readonly status: "missing"; readonly providerId?: string }
  | { readonly status: "ambiguous"; readonly providerIds: readonly string[] };
