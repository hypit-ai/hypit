import type { BuildResultRepositoryLocation } from "@hypit/build-result-kit";
import type { CommandResult } from "@hypit/protocol";
import type {
  CapacityAcquire,
  CapacityAcquireRequest,
  CapacityReservation,
} from "./capacity.js";

export type BuildOutcome = "complete" | "failed" | "cancelled";

export type BuildExecutionRequest = {
  readonly build: string;
  /** Installed component packages loaded when a Worker takes an execution turn. */
  readonly componentPackages: readonly string[];
  /** Exact project Result Repository selected at submission. */
  readonly result: BuildResultRepositoryLocation;
};

export type BuildExecutionDecision = {
  readonly outcome: BuildOutcome;
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
 * immutable execution conclusion is `decision`; operator attention is an independent fact.
 */
export type BuildExecutionSnapshot = BuildExecutionRequest & {
  readonly createdAt: number;
  readonly wakeAt: number;
  readonly turn?: BuildExecutionTurn;
  readonly resultWrite?: BuildResultWriteLease;
  readonly cancellation?: { readonly reason?: string };
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
  return execution.wakeAt > now ? "waiting" : "ready";
}

/** Ephemeral acknowledgement returned after active Runtime state has been removed. */
export type BuildCompletion = BuildExecutionDecision & {
  readonly build: string;
};

export type BuildExecutionStore = {
  create(request: BuildExecutionRequest, options?: { readonly now?: number }): Promise<BuildExecutionSnapshot>;
  read(build: string): Promise<BuildExecutionSnapshot | undefined>;
  list(): Promise<readonly BuildExecutionSnapshot[]>;
  /** Atomically take one ready, undecided execution turn for this Worker owner. */
  claim(owner: string, now?: number): Promise<BuildExecutionSnapshot | undefined>;
  /** A new owning Worker clears turns left by the previous process; no external action is repeated here. */
  reclaimTurns(now?: number): Promise<readonly string[]>;
  releaseTurn(build: string, owner: string, wakeAt: number): Promise<BuildExecutionSnapshot>;
  /** Freeze the one conclusion. An execution with a decision can never be claimed again. */
  decide(build: string, owner: string, outcome: BuildOutcome, reason?: string): Promise<BuildExecutionSnapshot>;
  requestCancellation(build: string, reason?: string): Promise<BuildExecutionSnapshot>;
  setAttention(build: string, attention: BuildExecutionAttention | undefined): Promise<BuildExecutionSnapshot>;
  claimResultWrite(build: string, owner: string, now?: number): Promise<BuildExecutionSnapshot | undefined>;
  releaseResultWrite(build: string, owner: string): Promise<BuildExecutionSnapshot>;
  /** Clear only Result-writer ownership left by the previous Runtime process and record attention. */
  reclaimResultWrites(): Promise<readonly string[]>;
  acquireCapacity(request: CapacityAcquireRequest): Promise<CapacityAcquire>;
  releaseCapacity(build: string, command: string): Promise<void>;
  releaseBuildCapacity(build: string): Promise<void>;
  listCapacity(): Promise<readonly CapacityReservation[]>;
};

export type CommandExecutionReceipt = {
  readonly build: string;
  readonly command: string;
  readonly status: "started" | "completed";
  readonly event?: CommandResult;
};

export type CommandExecutionBegin = {
  readonly created: boolean;
  readonly receipt: CommandExecutionReceipt;
};

/**
 * Live handoff for commands that complete in one call. It prevents the same Build from invoking
 * an immediate Producer or Endpoint again after the process stops between execution and Core fact.
 */
export type CommandExecutionStore = {
  begin(build: string, command: string): Promise<CommandExecutionBegin>;
  complete(build: string, command: string, event: CommandResult): Promise<CommandExecutionReceipt>;
  list(build: string): Promise<readonly CommandExecutionReceipt[]>;
  removeBuild(build: string): Promise<void>;
};
