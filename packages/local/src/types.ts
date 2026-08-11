import type { Awaitable, ComponentPackage } from "@narratage/component-kit";
import type { ArtifactAttachment } from "@narratage/host";
import type { EndpointPackage } from "@narratage/endpoint-kit";
import type { BuildState } from "@narratage/protocol";
import type { Digest } from "@narratage/protocol";
import type {
  ArtifactStore,
  BuildCatalog,
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildSchedulerFactory,
  BuildSchedulerOptions,
  BuildSnapshot,
  BuildStore,
  BuildDispatchStore,
  BuildDispatchSnapshot,
  CredentialStore,
  OperationStore,
  OperationSnapshot,
  RuntimeModuleRegistry,
  RuntimeServicePackage,
  RuntimeServiceSelection,
  RuntimeJournal,
  RuntimeWorkerFactory,
} from "@narratage/runtime";
import type { TypeValidatorRegistrar, TypeValidatorRegistryLike } from "@narratage/validation";

export type { ComponentPackage } from "@narratage/component-kit";

export type LocalTypeValidatorRegistry = TypeValidatorRegistryLike & TypeValidatorRegistrar;

export type { EndpointPackage } from "@narratage/endpoint-kit";
export type { RuntimeServicePackage } from "@narratage/runtime";

export type LocalRuntimeClosureOptions = {
  readonly modules: RuntimeModuleRegistry;
  readonly value: import("@narratage/runtime").RuntimeClosure;
  readonly allowedPermissions?: readonly string[];
};

export type CreateLocalRuntimeOptions = {
  readonly buildStore: BuildStore;
  /** Host presentation metadata only; never part of Runtime Closure or Core state. */
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly dispatchStore: import("@narratage/runtime").BuildDispatchStore;
  readonly journal: RuntimeJournal;
  readonly artifactStore: ArtifactStore;
  readonly credentialStore: CredentialStore;
  readonly scheduler: BuildSchedulerFactory;
  readonly worker: RuntimeWorkerFactory;
  readonly components?: readonly ComponentPackage[];
  readonly endpoints?: readonly EndpointPackage[];
  readonly closure: LocalRuntimeClosureOptions;
  readonly scheduling?: Omit<BuildSchedulerOptions, "buildStore" | "runtimeClosure">;
  readonly validators?: LocalTypeValidatorRegistry;
  /** Expected implementation package closure already bound into BuildRequest. */
  readonly implementationClosure?: import("@narratage/protocol").Digest;
  /** Verified physical Runtime-adapter package lock; absent only for trusted direct embedding. */
  readonly runtimePackageClosure?: import("@narratage/protocol").Digest;
};

export type CreateLocalRuntimeControlOptions = {
  readonly buildStore: BuildStore;
  readonly buildCatalog?: BuildCatalog;
  readonly operationStore: OperationStore;
  readonly dispatchStore: BuildDispatchStore;
  readonly journal: RuntimeJournal;
  readonly artifactStore: ArtifactStore;
  /** Optional owner supplied by the project service assembly. */
  readonly close?: () => Awaitable<void>;
};

export type CreateLocalCredentialControlOptions = {
  readonly credentialStore: CredentialStore;
  readonly endpoints: readonly EndpointPackage[];
  readonly close?: () => Awaitable<void>;
};

export type ProjectLocalRuntimeOptions = {
  /** Project directory containing the private .svml Runtime directory. Defaults to cwd. */
  readonly root?: string;
  /** Host directory whose node_modules contains the packages named by packageLock. Defaults to root. */
  readonly packageRoot?: string;
  readonly buildCatalog?: BuildCatalog;
  /** Exact installed implementation package lock. Source imports cannot change this selection. */
  readonly packageLock?: string;
  /** Already verified implementation identity when components are supplied by this Host process. */
  readonly implementationClosure?: import("@narratage/protocol").Digest;
  /** Verified physical Runtime-adapter package lock; absent only for trusted direct embedding. */
  readonly runtimePackageClosure?: import("@narratage/protocol").Digest;
  /**
   * Replaceable parts of the Runtime itself. One package may fill several roles;
   * every selected role is explicit, and two packages exposing the same instance
   * id are a configuration error rather than a choice made here.
   */
  readonly runtimeServices: readonly RuntimeServicePackage[];
  /** Exact service instances selected from runtimeServices; no role is inferred by uniqueness. */
  readonly runtimeSelection: RuntimeServiceSelection;
  readonly components?: readonly ComponentPackage[];
  readonly endpoints?: readonly EndpointPackage[];
  readonly allowedPermissions: readonly string[];
  readonly scheduling: {
    readonly maxConcurrency: number;
    readonly resources?: Readonly<Record<string, number>>;
    readonly maxEventsPerBuild?: number;
  };
  readonly validators?: LocalTypeValidatorRegistry;
};

export type ProjectLocalRuntimeControlOptions = Pick<ProjectLocalRuntimeOptions,
  | "root"
  | "buildCatalog"
  | "runtimeServices"
  | "runtimeSelection"
  | "allowedPermissions"
>;

export type LocalBuildRequest = {
  /** Stable user/run identity. Reusing it resumes only the same Core Build identity. */
  readonly id: string;
  readonly state: BuildState;
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
  readonly status: "queued" | "running" | "waiting" | "blocked" | "settling" | "complete" | "failed" | "cancelled";
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
  operation(id: Digest): Promise<OperationSnapshot | undefined>;
  journal(query?: import("@narratage/runtime").RuntimeJournalQuery): Promise<readonly import("@narratage/runtime").RuntimeJournalEntry[]>;
  credentials(endpoint?: string): Promise<readonly LocalCredentialStatus[]>;
  putCredential(endpoint: string, slot: string, secret: string): Promise<LocalCredentialStatus>;
  deleteCredential(endpoint: string, slot: string): Promise<{ readonly deleted: boolean; readonly credential: LocalCredentialStatus }>;
  builds(): Promise<readonly BuildCatalogEntry[]>;
  cancel(build: string, reason?: string): Promise<BuildDispatchSnapshot | undefined>;
  /** Request control of one exact Operation attempt without closing the whole Build. */
  cancelOperation(id: Digest, reason?: string): Promise<OperationSnapshot | undefined>;
  workOnce(options: { readonly owner: string; readonly leaseMs: number }): Promise<BuildDispatchSnapshot | undefined>;
  work(options: import("@narratage/runtime").RuntimeWorkerRunOptions): Promise<void>;
  readArtifact(digest: Digest): Promise<Uint8Array | undefined>;
  openArtifact(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined>;
  /** Explicit maintenance only. apply=false is a read-only reachability report. */
  garbageCollectArtifacts(options?: { readonly apply?: boolean }): Promise<ArtifactGarbageCollection>;
  close(): Awaitable<void>;
};

/** Durable project control that needs Stores but no Producer, Endpoint, Driver or Worker. */
export type LocalRuntimeControl = Pick<LocalRuntime,
  | "status"
  | "activity"
  | "queue"
  | "operation"
  | "journal"
  | "builds"
  | "cancel"
  | "cancelOperation"
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
