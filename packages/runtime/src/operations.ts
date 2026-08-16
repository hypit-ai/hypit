import type {
  CanonicalValue,
  StoredValue,
} from "@narratage/protocol";

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
  readonly pool?: string;
  readonly lane?: string;
};

export type OperationStore = {
  create(operation: OperationSnapshot): Promise<OperationSnapshot>;
  read(id: string): Promise<OperationSnapshot | undefined>;
  list(query: OperationQuery): Promise<readonly OperationSnapshot[]>;
  /** One local Worker owns execution. A terminal Operation is returned unchanged. */
  update(id: string, update: OperationUpdate): Promise<OperationSnapshot>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function sealOperationIdentity(
  value: OperationIdentity,
): OperationIdentity {
  assert(value.id.trim().length > 0, "Operation id is empty");
  assert(value.build.trim().length > 0, "Operation build id is empty");
  assert(value.command.trim().length > 0, "Operation command id is empty");
  assert(value.endpoint.trim().length > 0, "Operation Endpoint id is empty");
  assert(value.pool.trim().length > 0, "Operation Provider Pool is empty");
  assert(value.lane.trim().length > 0, "Operation Capability Lane is empty");
  return { ...value };
}

function copy(snapshot: OperationSnapshot): OperationSnapshot {
  return structuredClone(snapshot);
}

/** In-process reference Store. */
export class MemoryOperationStore implements OperationStore {
  readonly #operations = new Map<string, OperationSnapshot>();

  async create(operation: OperationSnapshot): Promise<OperationSnapshot> {
    if (this.#operations.has(operation.id)) throw new Error(`Operation ${operation.id} already exists`);
    this.#operations.set(operation.id, copy(operation));
    return copy(operation);
  }

  async read(id: string): Promise<OperationSnapshot | undefined> {
    const snapshot = this.#operations.get(id);
    return snapshot === undefined ? undefined : copy(snapshot);
  }

  async list(query: OperationQuery): Promise<readonly OperationSnapshot[]> {
    return [...this.#operations.values()]
      .filter((snapshot) => query.build === undefined || snapshot.build === query.build)
      .filter((snapshot) => query.command === undefined || snapshot.command === query.command)
      .filter((snapshot) => query.endpoint === undefined || snapshot.endpoint === query.endpoint)
      .filter((snapshot) => query.pool === undefined || snapshot.pool === query.pool)
      .filter((snapshot) => query.lane === undefined || snapshot.lane === query.lane)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(copy);
  }

  async update(id: string, update: OperationUpdate): Promise<OperationSnapshot> {
    const current = this.#operations.get(id);
    assert(current !== undefined, `Operation ${id} does not exist`);
    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") {
      return copy(current);
    }
    const mutable = update.status === "pending"
      ? {
          status: "pending" as const,
          handle: structuredClone(update.handle),
          ...(update.wakeAt === undefined ? {} : { wakeAt: update.wakeAt }),
          ...(update.progress === undefined ? {} : { progress: structuredClone(update.progress) }),
        }
        : update.status === "completed"
        ? { status: "completed" as const, completion: structuredClone(update.completion) }
        : update.status === "failed"
          ? { status: "failed" as const, failure: structuredClone(update.failure) }
          : { status: "cancelled" as const };
    const snapshot: OperationSnapshot = {
      id: current.id,
      build: current.build,
      command: current.command,
      endpoint: current.endpoint,
      pool: current.pool,
      lane: current.lane,
      ...mutable,
    };
    this.#operations.set(id, snapshot);
    return copy(snapshot);
  }
}
