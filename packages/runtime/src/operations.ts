import type {
  CanonicalValue,
  StoredValue,
  FulfillNeedCommand,
} from "@hypit/protocol";
import type { CredentialRef } from "./credentials.js";

/** Provider-authored, non-secret acknowledgement suitable for Results and user inspection. */
export type OperationReceipt = {
  readonly id: string;
  readonly url?: string;
};

export type OperationFacts = {
  readonly createdAt?: number;
  readonly acknowledgedAt?: number;
  readonly endedAt?: number;
  /** The exact request needed to advance this Operation without materializing its Build. */
  readonly request?: FulfillNeedCommand;
  readonly credentials?: Readonly<Record<string, CredentialRef>>;
  readonly pool?: string;
  readonly receipt?: OperationReceipt;
  readonly remoteEnded?: true;
  readonly submission?: "queued" | "started" | "accepted";
};

export type OperationIdentity = {
  readonly id: string;
  readonly build: string;
  readonly command: string;
  readonly endpoint: string;
};

export type OperationCompletion = {
  readonly value: StoredValue;
};

export type OperationFailure = {
  readonly code: string;
  readonly message: string;
};

/**
 * Provider-neutral, human-observable progress for one asynchronous Operation.
 *
 * The opaque handle remains the Provider's private task state. This
 * deliberately small projection is the only part Runtime tools may display;
 * it must not carry credentials, request bodies or vendor-specific payloads.
 */
export type OperationProgress = {
  readonly phase: string;
  readonly completed?: number;
  readonly total?: number;
  readonly unit?: string;
};

export type OperationSnapshot = OperationIdentity & OperationFacts & {
  readonly status: OperationUpdate["status"];
  readonly handle?: CanonicalValue;
  readonly wakeAt?: number;
  readonly progress?: OperationProgress;
  readonly completion?: OperationCompletion;
  readonly failure?: OperationFailure;
  /** Last acknowledgement of an explicit, best-effort cancellation request. */
  readonly cancellation?: { readonly outcome: "confirmed" | "accepted" | "unsupported" | "too-late" | "failed"; readonly message?: string };
};

export type OperationUpdate = OperationFacts & (
  | {
      readonly status: "pending";
      /** Candidate awaits Build-boundary validation. */
      readonly completion?: OperationCompletion;
      /** Provider-owned task state once submission is acknowledged. */
      readonly handle?: CanonicalValue;
      readonly wakeAt?: number;
      readonly progress?: OperationProgress;
    }
  | {
      readonly status: "completed";
      readonly completion: OperationCompletion;
    }
  | { readonly status: "failed"; readonly failure: OperationFailure }
  | { readonly status: "cancelled"; readonly cancellation?: OperationSnapshot["cancellation"] });

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
