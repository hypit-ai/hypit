import type {
  BlobRef,
  BuildEvent,
  BuildState,
  CoreCommand,
  Digest,
} from "@narratage/protocol";
import type { RuntimeClosure } from "./profile.js";

export type RuntimeBlockedCommand = {
  readonly command: string;
  readonly reason: string;
  readonly subject: string;
};

export type RuntimeRunnableCommand = {
  readonly command: CoreCommand;
  /** One authority-wide concurrency bucket, normally an Endpoint instance or local implementation. */
  readonly lane: string;
  /** Registration default; a Runtime Profile may explicitly override it for this Scheduler. */
  readonly maxConcurrency: number;
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
  | { readonly status: "pending"; readonly operation: Digest; readonly wakeAt?: number };

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
};

/** Content-addressed bytes. Location, retention and remote transport are adapter policy. */
export type ArtifactStore = {
  put(bytes: Uint8Array, mediaType: string): Promise<BlobRef>;
  get(digest: Digest): Promise<Uint8Array | undefined>;
  has(digest: Digest): Promise<boolean>;
};

/** Optional transfer capability. Core and components never require storage to expose it. */
export type StreamingArtifactStore = ArtifactStore & {
  putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<BlobRef>;
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

export type SchedulerJournalEntry = {
  readonly command: string;
  readonly kind: CoreCommand["kind"];
  readonly lane: string;
  readonly status: "completed" | "pending" | "error";
  readonly event?: string;
  readonly operation?: Digest;
  readonly wakeAt?: number;
  readonly message?: string;
};

export type ScheduledBuildResult = {
  readonly id: string;
  readonly status: "complete" | "paused" | "failed";
  readonly state: BuildState;
  readonly journal: readonly SchedulerJournalEntry[];
  readonly blocked: readonly RuntimeBlockedCommand[];
};

export type BuildSchedulerOptions = {
  readonly maxConcurrency?: number;
  readonly laneLimits?: Readonly<Record<string, number>>;
  readonly maxEventsPerBuild?: number;
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

/** @deprecated The options are not specific to the reference local implementation. */
export type LocalBuildSchedulerOptions = BuildSchedulerOptions;
