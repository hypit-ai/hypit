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

export type ArtifactStore = {
  put(bytes: Uint8Array, mediaType: string): Promise<BlobRef>;
  get(digest: Digest): Promise<Uint8Array | undefined>;
  has(digest: Digest): Promise<boolean>;
};

export type DriverJournalEntry = {
  readonly command: string;
  readonly kind: CoreCommand["kind"];
  readonly status: "completed" | "blocked" | "error";
  readonly event?: string;
  readonly message?: string;
};

export type BlockedCommand = {
  readonly command: string;
  readonly reason:
    | "missing-producer"
    | "implementation-mismatch"
    | "missing-provider"
    | "ambiguous-provider";
  readonly subject: string;
};

export type DriverRunResult = {
  readonly status: "complete" | "paused" | "failed";
  readonly state: BuildState;
  readonly journal: readonly DriverJournalEntry[];
  readonly blocked: readonly BlockedCommand[];
};

export type ProducerRegistration = {
  readonly producer: ProducerRef;
  readonly implementationDigest: Digest;
  readonly handler: ProducerHandler;
};

export type ProviderRegistration = {
  readonly id: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly handler: ProviderHandler;
  readonly supports?: (need: Need) => boolean;
};

export type ProviderResolution =
  | { readonly status: "resolved"; readonly registration: ProviderRegistration }
  | { readonly status: "missing"; readonly providerId?: string }
  | { readonly status: "ambiguous"; readonly providerIds: readonly string[] };
