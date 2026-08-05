import type {
  BuildEvent,
  BuildState,
  CoreCommand,
  Digest,
} from "@svml/protocol";
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
  | { readonly status: "pending"; readonly operation: Digest };

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
  readonly message?: string;
};

export type ScheduledBuildResult = {
  readonly id: string;
  readonly status: "complete" | "paused" | "failed";
  readonly state: BuildState;
  readonly journal: readonly SchedulerJournalEntry[];
  readonly blocked: readonly RuntimeBlockedCommand[];
};

export type LocalBuildSchedulerOptions = {
  readonly maxConcurrency?: number;
  readonly laneLimits?: Readonly<Record<string, number>>;
  readonly maxEventsPerBuild?: number;
  readonly runtimeClosure?: RuntimeClosure;
};
