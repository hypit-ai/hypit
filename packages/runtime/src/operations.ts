import type {
  CanonicalValue,
  StoredValue,
} from "@hypit/protocol";

export type OperationIdentity = {
  readonly id: string;
  readonly build: string;
  readonly command: string;
  readonly endpoint: string;
  readonly pool: string;
  readonly lane: string;
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
};

export type OperationUpdate =
  | {
      readonly status: "pending";
      readonly handle: CanonicalValue;
      readonly wakeAt?: number;
      readonly progress?: OperationProgress;
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
  /** Drop Provider execution payloads after the owning Build Result is terminal. */
  removeBuild?(build: string): Promise<void>;
};
