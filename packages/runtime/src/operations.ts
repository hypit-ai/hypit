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

export type OperationCompletion = { readonly value: Value };

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
      readonly completion: OperationCompletion;
      readonly acknowledgedAt: number;
      readonly endedAt: number;
    }
  | {
      readonly status: "completed";
      readonly completion: OperationCompletion;
      readonly acknowledgedAt: number;
      readonly endedAt: number;
    }
  | { readonly status: "failed"; readonly failure: OperationFailure; readonly endedAt: number }
  | { readonly status: "cancelled"; readonly cancellation: OperationCancellation; readonly endedAt: number };

export type OperationSnapshot = OperationIdentity & OperationContext & OperationEvidence & OperationState;

/** Updates replace the lifecycle phase while preserving immutable context and accumulated evidence. */
export type OperationUpdate = OperationEvidence & OperationState;

export function applyOperationUpdate(current: OperationSnapshot, update: OperationUpdate): OperationSnapshot {
  if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
    return current;
  }
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
  /** One local Worker owns execution. A terminal Operation is returned unchanged. */
  update(id: string, update: OperationUpdate): Promise<OperationSnapshot>;
  /** Drop Provider execution payloads after the owning Build Result has an outcome. */
  removeBuild?(build: string): Promise<void>;
};
