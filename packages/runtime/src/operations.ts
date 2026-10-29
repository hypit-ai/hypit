import type { CanonicalValue, Need, Value } from "@hypit/protocol";
import type { CredentialRef } from "./credentials.js";

/** Provider-authored, non-secret acknowledgement suitable for Results and user inspection. */
export type OperationReceipt = {
  readonly id: string;
  readonly url?: string;
};

export type OperationIdentity = {
  readonly id: string;
  readonly build: string;
  readonly command: string;
  readonly endpoint: string;
};

/** Immutable execution context captured when the Operation is created. */
export type OperationContext = {
  readonly createdAt: number;
  readonly need: Need;
  readonly credentials: Readonly<Record<string, CredentialRef>>;
  readonly pool?: string;
};

export type OperationFailure = {
  readonly code: string;
  readonly message: string;
};

/** Provider-neutral, human-observable progress for one asynchronous Operation. */
export type OperationProgress = {
  readonly phase: string;
  readonly completed?: number;
  readonly total?: number;
  readonly unit?: string;
};

export type OperationCancellation = {
  readonly outcome: "confirmed" | "accepted" | "unsupported" | "too-late" | "failed";
  readonly message?: string;
};

export type OperationEvidence = {
  readonly receipt?: OperationReceipt;
  readonly progress?: OperationProgress;
};

/** Every executable phase carries the facts required to perform its one valid next action. */
export type OperationState =
  | { readonly status: "queued"; readonly wakeAt?: number }
  | { readonly status: "submitting" }
  | {
      readonly status: "running";
      readonly handle: CanonicalValue;
      readonly acknowledgedAt: number;
      readonly wakeAt?: number;
    }
  | {
      readonly status: "collecting";
      readonly handle: CanonicalValue;
      readonly acknowledgedAt: number;
      readonly endedAt: number;
      readonly wakeAt?: number;
    }
  | {
      readonly status: "received";
      readonly value: Value;
      readonly acknowledgedAt: number;
      readonly endedAt: number;
    }
  | {
      readonly status: "completed";
      readonly value: Value;
      readonly acknowledgedAt: number;
      readonly endedAt: number;
    }
  | { readonly status: "failed"; readonly failure: OperationFailure; readonly endedAt: number }
  | { readonly status: "cancelled"; readonly cancellation: OperationCancellation; readonly endedAt: number };

export type OperationSnapshot = OperationIdentity & OperationContext & OperationEvidence & OperationState;

/** Updates replace the lifecycle phase while preserving immutable context and accumulated evidence. */
export type OperationUpdate = OperationEvidence & OperationState;

const operationTransitions: Readonly<Record<OperationState["status"], readonly OperationState["status"][]>> = {
  queued: ["queued", "submitting", "failed", "cancelled"],
  submitting: ["running", "collecting", "received", "failed", "cancelled"],
  running: ["running", "collecting", "received", "failed", "cancelled"],
  collecting: ["collecting", "received", "failed", "cancelled"],
  received: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function assertOperationTransition(current: OperationSnapshot, update: OperationUpdate): void {
  if (!operationTransitions[current.status].includes(update.status)) {
    throw new Error(`Operation ${current.id} cannot transition from ${current.status} to ${update.status}`);
  }
}

export function applyOperationUpdate(current: OperationSnapshot, update: OperationUpdate): OperationSnapshot {
  assertOperationTransition(current, update);
  return {
    id: current.id,
    build: current.build,
    command: current.command,
    endpoint: current.endpoint,
    createdAt: current.createdAt,
    need: current.need,
    credentials: current.credentials,
    ...(current.pool === undefined ? {} : { pool: current.pool }),
    ...(update.receipt ?? current.receipt) === undefined ? {} : { receipt: update.receipt ?? current.receipt },
    ...(update.progress ?? current.progress) === undefined ? {} : { progress: update.progress ?? current.progress },
    ...update,
  } as OperationSnapshot;
}

export type OperationQuery = {
  readonly build?: string;
  readonly command?: string;
  readonly endpoint?: string;
};

export type OperationStore = {
  create(operation: OperationSnapshot): Promise<OperationSnapshot>;
  read(id: string): Promise<OperationSnapshot | undefined>;
  list(query: OperationQuery): Promise<readonly OperationSnapshot[]>;
  /** One local Worker owns execution. Invalid or terminal-state transitions are rejected. */
  update(id: string, update: OperationUpdate): Promise<OperationSnapshot>;
  /** Drop Provider execution payloads after the owning Build Result has an outcome. */
  removeBuild?(build: string): Promise<void>;
};
