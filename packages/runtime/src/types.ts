import type {
  BlobRef,
  BuildDefinition,
  BuildFact,
  CommandResult,
  BuildCommand,
  ResourceId,
  Need,
  ProducerRef,
} from "@hypit/protocol";
import type { BuildView } from "@hypit/kernel";
import type { OperationSnapshot } from "./operations.js";

export type RuntimeBlockedCommand =
  | { readonly command: string; readonly reason: "missing-producer"; readonly subject: string;
      readonly step: string; readonly producer: ProducerRef }
  | { readonly command: string; readonly reason: "missing-endpoint" | "unsupported-endpoint-request"
      | "ambiguous-endpoint" | "missing-operation-store"; readonly subject: string; readonly need: Need };

export type RuntimeRunnableCommand = {
  readonly command: BuildCommand;
  /** Every resource is acquired atomically before the command can cause a side effect. */
  readonly resources: readonly RuntimeResourceClaim[];
  /** Asynchronous work retains one shared in-flight reservation while polling. */
  readonly capacityMode?: "active" | "asynchronous";
};

export type RuntimeResourceClaim = import("./capacity.js").CapacityResourceClaim;

export type RuntimePreparation = {
  readonly state: BuildView;
  readonly runnable: readonly RuntimeRunnableCommand[];
  readonly blocked: readonly RuntimeBlockedCommand[];
};

export type RuntimeExecutionContext = {
  /** Stable Build identity; two identical submissions remain distinct execution attempts. */
  readonly build: string;
  /** Observational activity of this call; it never changes scheduling or Core facts. */
  readonly reportProgress?: (activity: import("./execution.js").CommandExecutionActivity) => Promise<void>;
  /** Execution evidence; the Runtime owns persistence. Implementations keep logging failures out of Provider outcomes. */
  readonly recordExecution?: (event: import("./log.js").ExecutionLogEvent) => Promise<void>;
  /** Release only the asynchronous Operation's occupancy after its remote end is confirmed. */
  readonly releaseOperationCapacity?: () => Promise<void>;
};

export type RuntimeActionResult<T> =
  | { readonly status: "completed"; readonly value: T }
  | Extract<RuntimeExecutionResult, { readonly status: "deferred" }>;

/** One short action; occupancy ends with the call, while rate consumption remains. */
export type RuntimeActionExecutor = {
  run<T>(request: { readonly build: string; readonly command: string; readonly action: string;
    readonly resources: readonly RuntimeResourceClaim[] }, execute: () => Promise<T>): Promise<RuntimeActionResult<T>>;
};

export type RuntimeExecutionResult =
  | { readonly status: "completed"; readonly event: CommandResult; readonly operation?: string }
  | { readonly status: "pending"; readonly operation: string; readonly wakeAt?: number }
  | { readonly status: "deferred"; readonly wakeAt?: number; readonly reason: string };

/** Build-local indexed execution view. Definition + Facts remain the only durable representation. */
export type RuntimeBuildExecution = {
  view(): BuildView;
  commands(): readonly BuildCommand[];
  record(id: string): import("@hypit/protocol").TypedRecord | undefined;
};

/** Minimal execution port used by a Scheduler. Core has already generated `state.outstanding`; prepare classifies it for this Host. */
export type RuntimeCommandExecutor = {
  prepare(execution: RuntimeBuildExecution): RuntimePreparation;
  executeCommand(
    execution: RuntimeBuildExecution,
    command: RuntimeRunnableCommand,
    context: RuntimeExecutionContext,
  ): Promise<RuntimeExecutionResult>;
  cancelOperation?(operation: OperationSnapshot): Promise<OperationSnapshot>;
  advanceOperation?(operation: OperationSnapshot, context?: RuntimeExecutionContext): Promise<OperationSnapshot>;
  /** Validate an already received result without invoking a Producer or contacting an Endpoint. */
  acceptOperation?(execution: RuntimeBuildExecution, operation: OperationSnapshot): Promise<CommandResult | undefined>;
  /** Mark a received Operation completed only after its event has become a Kernel Fact. */
  completeOperation?(operation: string): Promise<void>;
};

/** Build-local byte resources. Location, retention and transport are Runtime policy. */
export type ResourceIOOptions = {
  /** Cancel the transfer, close its streams and discard unfinished writes before rejecting.
   * Stream producers supplied by the caller must observe the same signal while producing chunks.
   */
  readonly signal?: AbortSignal;
};

export type ResourceStore = {
  /** Store one new resource instance. Equal bytes remain independent resources. */
  put(bytes: Uint8Array, mediaType: string, options?: ResourceIOOptions): Promise<BlobRef>;
  /** Write bytes for one resource already declared by the current execution. */
  write(resource: BlobRef, bytes: Uint8Array, options?: ResourceIOOptions): Promise<void>;
  /** Read bytes previously stored under this execution identity. */
  get(resource: ResourceId, options?: ResourceIOOptions): Promise<Uint8Array | undefined>;
  /** Cheap presence query. */
  has(resource: ResourceId, options?: ResourceIOOptions): Promise<boolean>;
};

/** Optional transfer capability. Core and components never require storage to expose it. */
export type StreamingResourceStore = ResourceStore & {
  putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string, options?: ResourceIOOptions): Promise<BlobRef>;
  writeStream(resource: BlobRef, chunks: AsyncIterable<Uint8Array>, options?: ResourceIOOptions): Promise<void>;
  /** Stream bytes previously stored under this resource identity. */
  open(resource: ResourceId, options?: ResourceIOOptions): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export function isStreamingResourceStore(value: ResourceStore): value is StreamingResourceStore {
  return "putStream" in value && typeof value.putStream === "function"
    && "writeStream" in value && typeof value.writeStream === "function"
    && "open" in value && typeof value.open === "function";
}

export type BuildSnapshot = {
  readonly build: string;
  readonly definition: BuildDefinition;
  readonly facts: readonly BuildFact[];
};

/** Stores one Definition and the Core Facts accepted for it in order. */
export type BuildStore = {
  create(build: string, definition: BuildDefinition): Promise<BuildSnapshot>;
  read(build: string): Promise<BuildSnapshot | undefined>;
  append(build: string, fact: BuildFact): Promise<void>;
  /** Drop execution material after the project Build Result has become authoritative. */
  remove?(build: string): Promise<void>;
};

/** One execution submission. Definition + Facts are the only accepted Build input. */
export type ScheduledBuild = {
  readonly id: string;
  readonly definition: BuildDefinition;
  readonly facts: readonly BuildFact[];
};

type SchedulerExecutionOutcomeBase = {
  readonly command: string;
  readonly kind: BuildCommand["kind"];
  readonly resources: readonly string[];
};

export type SchedulerExecutionOutcome = SchedulerExecutionOutcomeBase & (
  | { readonly status: "completed"; readonly operation?: never; readonly wakeAt?: never; readonly message?: never }
  | { readonly status: "pending"; readonly operation: string; readonly wakeAt?: number; readonly message?: never }
  | { readonly status: "deferred"; readonly wakeAt?: number; readonly message: string; readonly operation?: never }
  | { readonly status: "error"; readonly message: string; readonly operation?: never; readonly wakeAt?: never }
);

export type ScheduledBuildResult = {
  readonly id: string;
  readonly status: "complete" | "paused" | "failed";
  readonly definition: BuildDefinition;
  /** Accepted Facts, including those appended during this scheduler run. */
  readonly facts: readonly BuildFact[];
  readonly state: BuildView;
  readonly outcomes: readonly SchedulerExecutionOutcome[];
  readonly blocked: readonly RuntimeBlockedCommand[];
};

export type BuildSchedulerOptions = {
  /** Optional durable authority. When present, every accepted Core Fact is appended. */
  readonly buildStore?: BuildStore;
  /** Called after an accepted event changes the materialized Build view. */
  readonly onStateChange?: (build: string, state: BuildView) => Promise<void>;
  /** Per-Build observation and capacity callbacks; they do not participate in scheduling decisions. */
  readonly executionContext?: (build: string) => Omit<RuntimeExecutionContext, "build">;
};
