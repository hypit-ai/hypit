import type {
  CanonicalValue,
  StoredValue,
} from "@hypit/protocol";

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

export type OperationSnapshot = OperationIdentity & {
  readonly status: OperationUpdate["status"];
  readonly handle?: CanonicalValue;
  readonly wakeAt?: number;
  readonly progress?: OperationProgress;
  readonly completion?: OperationCompletion;
  readonly failure?: OperationFailure;
  /** A cancel call was attempted; subsequent turns only observe the same external work. */
  readonly cancellationRequested?: true;
};

export type OperationUpdate =
  | {
      readonly status: "pending";
      /** Missing only when submission acknowledgement is unknown; never resubmit automatically. */
      readonly handle?: CanonicalValue;
      readonly wakeAt?: number;
      readonly progress?: OperationProgress;
      /** Local execution failed, but remote settlement has not yet been confirmed. */
      readonly failure?: OperationFailure;
      readonly cancellationRequested?: true;
    }
  | {
      readonly status: "completed";
      readonly completion: OperationCompletion;
    }
  | { readonly status: "failed"; readonly failure: OperationFailure }
  | { readonly status: "cancelled" };

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
