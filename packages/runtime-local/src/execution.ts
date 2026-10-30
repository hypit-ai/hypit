import type {
  CapacityAcquire,
  CapacityAcquireRequest,
  CapacityReservation,
} from "@hypit/hypit/runtime";

export type BuildOutcome = "complete" | "failed" | "cancelled";

/** Exact host-local directory chosen before a Build becomes active. */
export type BuildResultRepositoryLocation = {
  /** Project ownership boundary used to record a portable Author Source path. */
  readonly root: string;
  /** Host-local filesystem path below the project root. */
  readonly path: string;
};

export type BuildExecutionRequest = {
  readonly build: string;
  /** Host-owned execution choices. Opaque to the graph and Core. */
  readonly context?: import("@hypit/hypit/protocol").CanonicalValue;
  /** Installed execution packages loaded when this execution context starts. */
  readonly executionPackages: readonly string[];
  /** Exact project Result Repository selected at submission. */
  readonly result: BuildResultRepositoryLocation;
};

export type BuildExecutionDecision =
  | { readonly outcome: "complete"; readonly reason?: never }
  | { readonly outcome: "failed" | "cancelled"; readonly reason: string };

/** A durable instruction to stop launching work, independent of remote Operation termination. */
export type BuildExecutionStop = {
  readonly cause: "user-cancelled" | "execution-failed";
  readonly reason?: string;
};

export type BuildExecutionAttention = {
  readonly step: "result" | "cleanup";
  readonly error: string;
};

export type BuildExecutionTurn = {
  readonly owner: string;
  readonly acquiredAt: number;
};

export type BuildResultWriteLease = BuildExecutionTurn;

/**
 * The complete active Runtime root for one Build.
 *
 * It has no persisted lifecycle phase. Scheduling is derived from `wakeAt` and `turn`; the one
 * immutable execution conclusion is `decision`; `stop` records why new work must stop while
 * the Result is written. Operator attention is an independent fact.
 */
export type BuildExecutionSnapshot = BuildExecutionRequest & {
  readonly createdAt: number;
  /** An execution context has been assigned; losing it ends this attempt. */
  readonly startedAt?: number;
  /** Absent when waiting for a resource release. */
  readonly wakeAt?: number;
  /** Only these Operations can advance the Build until their next outcome. */
  readonly operationWait?: readonly string[];
  readonly turn?: BuildExecutionTurn;
  readonly resultWrite?: BuildResultWriteLease;
  readonly stop?: BuildExecutionStop;
  readonly decision?: BuildExecutionDecision;
  readonly attention?: BuildExecutionAttention;
};

export type BuildExecutionActivity = "ready" | "running" | "waiting" | "saving-result";

export function buildExecutionActivity(
  execution: BuildExecutionSnapshot,
  now = Date.now(),
): BuildExecutionActivity {
  if (execution.decision !== undefined) return "saving-result";
  if (execution.turn !== undefined) return "running";
  return execution.wakeAt === undefined || execution.wakeAt > now ? "waiting" : "ready";
}

/** Ephemeral acknowledgement returned after active Runtime state has been removed. */
export type BuildCompletion = BuildExecutionDecision & {
  readonly build: string;
};

export type BuildExecutionStore = {
  create(request: BuildExecutionRequest, options?: { readonly now?: number }): Promise<BuildExecutionSnapshot>;
  read(build: string): Promise<BuildExecutionSnapshot | undefined>;
  list(): Promise<readonly BuildExecutionSnapshot[]>;
  /** Lightweight scheduling views; no Definition, Profile or Operation payloads are loaded. */
  listUnstarted(): Promise<readonly string[]>;
  listReady(now?: number): Promise<readonly string[]>;
  /** Atomically take one ready, undecided execution turn for this Worker owner. */
  claim(owner: string, now?: number, build?: string): Promise<BuildExecutionSnapshot | undefined>;
  start(build: string, now?: number): Promise<BuildExecutionSnapshot>;
  /** Conclude after the owner confirms this execution context has ended. Never repeats external work. */
  interrupt(build: string, reason: string): Promise<BuildExecutionSnapshot>;
  /** An unobserved stop wakes the next turn immediately to finish the attempt. */
  releaseTurn(build: string, owner: string, wakeAt: number | undefined, operationWait?: readonly string[]): Promise<BuildExecutionSnapshot>;
  /** Freeze the one conclusion. An execution with a decision can never be claimed again. */
  decide(build: string, owner: string, decision: BuildExecutionDecision): Promise<BuildExecutionSnapshot>;
  /** Record the first stop request. Repeated requests cannot replace its cause or reason. */
  requestStop(build: string, stop: BuildExecutionStop): Promise<BuildExecutionSnapshot>;
  setAttention(build: string, attention: BuildExecutionAttention | undefined): Promise<BuildExecutionSnapshot>;
  claimResultWrite(build: string, owner: string, now?: number): Promise<BuildExecutionSnapshot | undefined>;
  releaseResultWrite(build: string, owner: string): Promise<BuildExecutionSnapshot>;
  /** Clear only Result-writer ownership left by the previous Runtime process before automatic recovery. */
  reclaimResultWrites(): Promise<readonly string[]>;
  acquireCapacity(request: CapacityAcquireRequest): Promise<CapacityAcquire>;
  releaseCapacity(build: string, command: string): Promise<void>;
  releaseBuildCapacity(build: string): Promise<void>;
  reclaimActionCapacity(): Promise<void>;
  listCapacity(): Promise<readonly CapacityReservation[]>;
};
