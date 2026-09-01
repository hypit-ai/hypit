import type {
  BlobRef,
  BuildDefinition,
  BuildFact,
  BuildState,
  CommandResult,
  CoreCommand,
  Digest,
} from "@hypit/protocol";
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
  readonly queue?: RuntimeQueueLane;
  /** Asynchronous work retains one shared in-flight reservation while polling. */
  readonly capacityMode?: "active" | "asynchronous";
};

export type RuntimeResourceClaim = {
  readonly id: string;
  readonly maxActive: number;
  readonly maxInFlight: number;
};

export type RuntimeQueueLane = {
  readonly pool: string;
  readonly lane: string;
};

export type RuntimeWorkerRunOptions = {
  readonly idlePollMs: number;
  readonly signal?: AbortSignal;
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
  | { readonly status: "completed"; readonly event: CommandResult }
  | { readonly status: "pending"; readonly operation: string; readonly wakeAt?: number }
  | { readonly status: "deferred"; readonly wakeAt: number; readonly reason: string };

/** Minimal execution port used by a Scheduler. `prepare` is the sole command-generation boundary. */
export type RuntimeCommandExecutor = {
  prepare(state: BuildState): RuntimePreparation;
  executeCommand(
    state: BuildState,
    command: RuntimeRunnableCommand,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult>;
  cancelOperation?(
    state: BuildState,
    operation: OperationSnapshot,
  ): Promise<OperationSnapshot>;
};

/** Content-addressed bytes. Location, retention and remote transport are adapter policy. */
export type ArtifactStore = {
  /** Admit bytes and compute their identity in the same pass. */
  put(bytes: Uint8Array, mediaType: string): Promise<BlobRef>;
  /** Read bytes previously admitted under this digest. */
  get(digest: Digest): Promise<Uint8Array | undefined>;
  /** Cheap presence query. */
  has(digest: Digest): Promise<boolean>;
};

/** Optional transfer capability. Core and components never require storage to expose it. */
export type StreamingArtifactStore = ArtifactStore & {
  putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<BlobRef>;
  /** Stream bytes previously admitted under this digest. */
  open(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export function isStreamingArtifactStore(value: ArtifactStore): value is StreamingArtifactStore {
  return "putStream" in value && typeof value.putStream === "function"
    && "open" in value && typeof value.open === "function";
}

export type BuildSnapshot = {
  readonly build: string;
  readonly definition: BuildDefinition;
  readonly facts: readonly BuildFact[];
  /** Materialized read view reconstructed from Definition + Facts; never stored as authority. */
  readonly state: BuildState;
};

/** Stores one Definition and the Core Facts accepted for it in order. */
export type BuildStore = {
  create(build: string, definition: BuildDefinition): Promise<BuildSnapshot>;
  read(build: string): Promise<BuildSnapshot | undefined>;
  append(build: string, fact: BuildFact): Promise<void>;
  /** Drop execution material after the project Build Result has become authoritative. */
  remove?(build: string): Promise<void>;
};

export type ScheduledBuild =
  | { readonly id: string; readonly state: BuildState; readonly snapshot?: never }
  | { readonly id: string; readonly snapshot: BuildSnapshot; readonly state?: never };

export type SchedulerExecutionOutcome = {
  readonly command: string;
  readonly kind: CoreCommand["kind"];
  readonly resources: readonly string[];
  readonly status: "completed" | "pending" | "deferred" | "error";
  readonly operation?: string;
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
  /** Optional durable authority. When present, every admitted Core Fact is appended. */
  readonly buildStore?: BuildStore;
  /** Called after an accepted event changes the materialized Build view. */
  readonly onStateChange?: (build: string, state: BuildState) => Promise<void>;
};
