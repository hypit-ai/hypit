import type {
  BlobRef,
  BuildEvent,
  BuildState,
  CoreCommand,
  Digest,
} from "@narratage/protocol";
import type { RuntimeClosure } from "./profile.js";
import type { BuildDispatchSnapshot, BuildDispatchStore } from "./dispatch.js";
import type { OperationSnapshot } from "./operations.js";

export type RuntimeBlockedCommand = {
  readonly command: string;
  readonly reason: string;
  readonly subject: string;
};

export type RuntimeRunnableCommand = {
  readonly command: CoreCommand;
  /** Every resource is acquired atomically before the command can cause a side effect. */
  readonly resources: readonly RuntimeResourceClaim[];
  readonly queue?: RuntimeQueueRoute;
  /** Recoverable work retains one shared in-flight reservation while polling. */
  readonly capacityMode?: "active" | "recoverable";
};

export type RuntimeResourceClaim = {
  readonly id: string;
  readonly maxActive: number;
  readonly maxInFlight: number;
};

export type RuntimeQueueRoute = {
  readonly authority: string;
  readonly route: string;
};

export type RuntimeExecutionStores = {
  readonly builds: BuildStore;
  readonly operations: import("./operations.js").OperationStore;
  readonly dispatch: BuildDispatchStore;
  readonly artifacts: ArtifactStore;
};

export type RuntimeWorkerRunOptions = {
  readonly owner: string;
  readonly leaseMs: number;
  readonly idlePollMs: number;
  readonly signal?: AbortSignal;
};

export type RuntimeWorker = {
  /** Claim and advance at most one Build. Undefined means no Dispatch was ready. */
  runOnce(options: Omit<RuntimeWorkerRunOptions, "idlePollMs" | "signal">): Promise<BuildDispatchSnapshot | undefined>;
  /** Continue until the caller-owned process signal is aborted. */
  run(options: RuntimeWorkerRunOptions): Promise<void>;
};

export type RuntimeWorkerFactoryOptions = {
  readonly scheduler: BuildSchedulerFactory;
  readonly stores: RuntimeExecutionStores;
  readonly scheduling: BuildSchedulerOptions;
  readonly runtimeClosure: RuntimeClosure;
};

/** Selected execution strategy. Process supervision remains a generic Host concern. */
export type RuntimeWorkerFactory = {
  create(executor: RuntimeCommandExecutor, options: RuntimeWorkerFactoryOptions): RuntimeWorker;
};

export type RuntimePreparation = {
  readonly state: BuildState;
  readonly runnable: readonly RuntimeRunnableCommand[];
  readonly blocked: readonly RuntimeBlockedCommand[];
};

export type RuntimeExecutionContext = {
  /** Stable Run-local identity; two identical BuildRequests may still be distinct Builds. */
  readonly build: string;
};

export type RuntimeExecutionResult =
  | { readonly status: "completed"; readonly event: BuildEvent }
  | { readonly status: "pending"; readonly operation: Digest; readonly wakeAt?: number }
  | { readonly status: "deferred"; readonly wakeAt: number; readonly reason: string };

/**
 * Minimal execution port used by a Scheduler. Implementations must regenerate the command from
 * trusted BuildState before causing side effects; the caller supplies only its identity.
 */
export type RuntimeCommandExecutor = {
  prepare(state: BuildState): RuntimePreparation;
  executeCommand(
    state: BuildState,
    commandId: string,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult>;
  cancelOperation?(
    state: BuildState,
    operation: OperationSnapshot,
    requestedAt: number,
  ): Promise<OperationSnapshot>;
};

/** Content-addressed bytes. Location, retention and remote transport are adapter policy. */
export type ArtifactStore = {
  /** Admit bytes and compute their identity in the same pass. */
  put(bytes: Uint8Array, mediaType: string): Promise<BlobRef>;
  /** Return verified bytes; a digest mismatch is an error, not a cache miss. */
  get(digest: Digest): Promise<Uint8Array | undefined>;
  /** Cheap presence query only. Integrity is checked when bytes cross get/open. */
  has(digest: Digest): Promise<boolean>;
};

/** Optional transfer capability. Core and components never require storage to expose it. */
export type StreamingArtifactStore = ArtifactStore & {
  putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<BlobRef>;
  /** Stream bytes once and reject completion when their digest does not match. */
  open(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined>;
};

/** Optional retention capability used only by explicit deployment maintenance. */
export type ManagedArtifactStore = ArtifactStore & {
  list(): Promise<readonly Digest[]>;
  delete(digest: Digest): Promise<boolean>;
};

export function isStreamingArtifactStore(value: ArtifactStore): value is StreamingArtifactStore {
  return "putStream" in value && typeof value.putStream === "function"
    && "open" in value && typeof value.open === "function";
}

export function isManagedArtifactStore(value: ArtifactStore): value is ManagedArtifactStore {
  return "list" in value && typeof value.list === "function"
    && "delete" in value && typeof value.delete === "function";
}

export type BuildSnapshot = {
  readonly build: string;
  readonly revision: number;
  readonly state: BuildState;
};

export type BuildStoreWrite =
  | { readonly status: "stored"; readonly snapshot: BuildSnapshot }
  | { readonly status: "conflict"; readonly current: BuildSnapshot };

/** Stores only verified Core state; execution attempts and checkpoints belong to OperationStore. */
export type BuildStore = {
  create(build: string, state: BuildState): Promise<BuildSnapshot>;
  read(build: string): Promise<BuildSnapshot | undefined>;
  compareAndSwap(build: string, expectedRevision: number, state: BuildState): Promise<BuildStoreWrite>;
};

/** Optional maintenance index; execution still depends only on BuildStore's three CAS operations. */
export type EnumerableBuildStore = BuildStore & {
  list(): Promise<readonly BuildSnapshot[]>;
};

export function isEnumerableBuildStore(value: BuildStore): value is EnumerableBuildStore {
  return "list" in value && typeof value.list === "function";
}

export type ScheduledBuild = {
  readonly id: string;
  readonly state: BuildState;
};

export type SchedulerExecutionOutcome = {
  readonly command: string;
  readonly kind: CoreCommand["kind"];
  readonly resources: readonly string[];
  readonly status: "completed" | "pending" | "deferred" | "error";
  readonly event?: string;
  readonly operation?: Digest;
  readonly wakeAt?: number;
  readonly message?: string;
};

export type ScheduledBuildResult = {
  readonly id: string;
  readonly status: "complete" | "paused" | "failed";
  readonly state: BuildState;
  readonly outcomes: readonly SchedulerExecutionOutcome[];
  readonly blocked: readonly RuntimeBlockedCommand[];
};

export type BuildSchedulerOptions = {
  readonly maxConcurrency?: number;
  readonly resourceLimits?: Readonly<Record<string, number>>;
  readonly runtimeClosure?: RuntimeClosure;
  /** Optional durable authority. When present, every accepted Core Event is persisted by CAS. */
  readonly buildStore?: BuildStore;
};

/** Environment-neutral scheduling authority selected by the Runtime Profile. */
export type BuildScheduler = {
  run(requests: readonly ScheduledBuild[]): Promise<readonly ScheduledBuildResult[]>;
};

/** Installed Scheduler implementation. It receives policy only after Runtime Closure resolution. */
export type BuildSchedulerFactory = {
  create(executor: RuntimeCommandExecutor, options?: BuildSchedulerOptions): BuildScheduler;
};
