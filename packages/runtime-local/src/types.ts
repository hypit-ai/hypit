import type { Awaitable, ComponentPackage } from "@narratage/component-kit";
import type { ArtifactAttachment } from "@narratage/workspace";
import type { EndpointPackage } from "@narratage/endpoint-kit";
import type { BuildDefinition, BuildState } from "@narratage/protocol";
import type { Digest } from "@narratage/protocol";
import type {
  ArtifactStore,
  BuildCatalog,
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildSchedulerOptions,
  BuildSnapshot,
  BuildStore,
  BuildDispatchStore,
  BuildDispatchSnapshot,
  CredentialStore,
  OperationStore,
  OperationSnapshot,
} from "@narratage/runtime";
import type { TypeValidatorRegistrar, TypeValidatorRegistryLike } from "@narratage/validation";

export type { ComponentPackage } from "@narratage/component-kit";

export type LocalTypeValidatorRegistry = TypeValidatorRegistryLike & TypeValidatorRegistrar;

export type { EndpointPackage } from "@narratage/endpoint-kit";

export type CreateLocalRuntimeOptions = {
  readonly buildStore: BuildStore;
  /** Host presentation metadata only; never part of Core state. */
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly dispatchStore: import("@narratage/runtime").BuildDispatchStore;
  readonly artifactStore: ArtifactStore;
  readonly credentialStore: CredentialStore;
  readonly components?: readonly ComponentPackage[];
  readonly endpoints?: readonly EndpointPackage[];
  readonly scheduling: Omit<BuildSchedulerOptions, "buildStore">;
  readonly validators?: LocalTypeValidatorRegistry;
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeArchiveControlOptions = {
  readonly buildStore: BuildStore;
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly dispatchStore: BuildDispatchStore;
  /** Optional owner supplied by the Runtime assembly. */
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeArtifactAccessOptions = {
  readonly artifactStore: ArtifactStore;
  /** Optional owner supplied by the Runtime assembly. */
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalRuntimeControlOptions = CreateLocalRuntimeArchiveControlOptions
  & CreateLocalRuntimeArtifactAccessOptions;

export type CreateLocalCredentialControlOptions = {
  readonly credentialStore: CredentialStore;
  readonly endpoints: readonly EndpointPackage[];
  readonly close?: () => Awaitable<void>;
};

export type LocalBuildRequest = {
  /** Caller-generated identity for one submission; Source identity is separate. */
  readonly id: string;
  readonly definition: BuildDefinition;
  /** Installed compute packages selected by this Build's Source closure. */
  readonly implementationPackages?: readonly string[];
  /** Source aliases and paths for Host inspection. Not trusted Build input. */
  readonly catalog?: BuildCatalogDescriptor;
  /** Host transfer bundle. It is staged before Core commands run and never enters BuildState. */
  readonly attachments?: readonly ArtifactAttachment[];
};

export type LocalBuildOptions = {
  /** Observe the durable Dispatch until terminal; execution remains owned by a Worker process. */
  readonly follow?: boolean;
  readonly pollIntervalMs?: number;
  readonly maxWaitMs?: number;
  readonly signal?: AbortSignal;
};

export type LocalRuntimeStatus = {
  readonly build: BuildSnapshot | undefined;
  readonly catalog: BuildCatalogEntry | undefined;
  readonly operations: readonly OperationSnapshot[];
  readonly dispatch: BuildDispatchSnapshot | undefined;
};

/** Lightweight execution facts. Unlike status(), this does not read or verify the BuildState. */
export type LocalRuntimeActivity = {
  readonly operations: readonly OperationSnapshot[];
  readonly dispatch: BuildDispatchSnapshot | undefined;
};

export type LocalRuntimeQueue = {
  readonly dispatches: readonly BuildDispatchSnapshot[];
  readonly capacity: readonly import("@narratage/runtime").CapacityReservation[];
  /** Execution facts belonging to non-terminal queued Builds. */
  readonly operations: readonly OperationSnapshot[];
};

export type LocalCredentialStatus = import("@narratage/endpoint-kit").EndpointCredentialDescription & {
  readonly configured: boolean;
  readonly writable: boolean;
};

export type LocalBuildSubmission = {
  readonly id: string;
  readonly state: BuildState;
  readonly status: "queued" | "running" | "waiting" | "blocked" | "complete" | "failed" | "cancelled";
  readonly dispatch: BuildDispatchSnapshot;
};

export type ArtifactGarbageCollection = {
  readonly reachable: readonly Digest[];
  readonly unreachable: readonly Digest[];
  readonly deleted: readonly Digest[];
};

export type LocalRuntime = {
  build(request: LocalBuildRequest, options?: LocalBuildOptions): Promise<LocalBuildSubmission>;
  buildMany(requests: readonly LocalBuildRequest[]): Promise<readonly LocalBuildSubmission[]>;
  status(build: string): Promise<LocalRuntimeStatus>;
  activity(build: string): Promise<LocalRuntimeActivity>;
  queue(): Promise<LocalRuntimeQueue>;
  operation(id: string): Promise<OperationSnapshot | undefined>;
  credentials(endpoint?: string): Promise<readonly LocalCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<LocalCredentialStatus>;
  deleteCredential(endpoint: string, slot: string): Promise<{ readonly deleted: boolean; readonly credential: LocalCredentialStatus }>;
  builds(): Promise<readonly BuildCatalogEntry[]>;
  cancel(build: string, reason?: string): Promise<BuildDispatchSnapshot | undefined>;
  workOnce(): Promise<BuildDispatchSnapshot | undefined>;
  work(options: import("@narratage/runtime").RuntimeWorkerRunOptions): Promise<void>;
  readArtifact(digest: Digest): Promise<Uint8Array | undefined>;
  openArtifact(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined>;
  /** Explicit maintenance only. apply=false is a read-only reachability report. */
  garbageCollectArtifacts(options?: { readonly apply?: boolean }): Promise<ArtifactGarbageCollection>;
  close(): Awaitable<void>;
};

/** Durable execution-state archive that never opens the selected ArtifactStore. */
export type LocalRuntimeArchiveControl = Pick<LocalRuntime,
  | "status"
  | "activity"
  | "queue"
  | "operation"
  | "builds"
  | "cancel"
  | "close"
>;

/** Explicit Artifact byte access that never opens Build, Operation or Dispatch state. */
export type LocalRuntimeArtifactAccess = Pick<LocalRuntime,
  | "readArtifact"
  | "openArtifact"
  | "close"
>;

/** Durable project control used only when one operation truly spans state and Artifacts. */
export type LocalRuntimeControl = Pick<LocalRuntime,
  | "status"
  | "activity"
  | "queue"
  | "operation"
  | "builds"
  | "cancel"
  | "readArtifact"
  | "openArtifact"
  | "garbageCollectArtifacts"
  | "close"
>;

/** Credential control for one or more exact Endpoint declarations; no execution state is opened. */
export type LocalCredentialControl = Pick<LocalRuntime,
  | "credentials"
  | "putCredential"
  | "deleteCredential"
  | "close"
>;
