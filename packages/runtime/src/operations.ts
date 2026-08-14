import { digestOf, isDigest } from "@narratage/protocol";
import type {
  CanonicalValue,
  Digest,
  StoredValue,
} from "@narratage/protocol";

export type OperationIdentity = {
  readonly format: "svml.operation-identity@1";
  readonly id: Digest;
  readonly build: string;
  readonly command: string;
  readonly endpoint: string;
  readonly authority: string;
  readonly route: string;
  readonly runtimeClosure: Digest;
  readonly attempt: number;
};

export type OperationCompletion = {
  readonly value: StoredValue;
};

export type OperationFailure = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  /** Earliest epoch millisecond at which Runtime policy may create another attempt. */
  readonly retryAt?: number;
};

export type OperationCancellationControl = {
  readonly requestedAt: number;
  readonly requestId: Digest;
  readonly status: "requested" | "accepted" | "confirmed" | "unsupported" | "too-late";
  readonly attempts: number;
  readonly retryAt?: number;
  readonly lastError?: { readonly code: string; readonly message: string };
};

/**
 * Provider-neutral, human-observable progress for one recoverable Operation.
 *
 * The opaque checkpoint remains the Provider's private recovery state. This
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
  readonly revision: number;
  readonly status: "created" | "pending" | "completed" | "failed" | "cancelled";
  readonly checkpoint?: CanonicalValue;
  readonly wakeAt?: number;
  readonly progress?: OperationProgress;
  readonly completion?: OperationCompletion;
  readonly failure?: OperationFailure;
  readonly cancellation?: OperationCancellationControl;
};

export type OperationUpdate =
  | {
      readonly status: "pending";
      readonly checkpoint: CanonicalValue;
      readonly wakeAt?: number;
      readonly progress?: OperationProgress;
    }
  | {
      readonly status: "completed";
      readonly completion: OperationCompletion;
    }
  | { readonly status: "failed"; readonly failure: OperationFailure }
  | { readonly status: "cancelled"; readonly cancellation: OperationCancellationControl }
  | { readonly status: "control"; readonly cancellation: OperationCancellationControl };

export type OperationCreate =
  | { readonly status: "created"; readonly snapshot: OperationSnapshot }
  | { readonly status: "existing"; readonly snapshot: OperationSnapshot };

export type OperationStoreWrite =
  | { readonly status: "stored"; readonly snapshot: OperationSnapshot }
  | { readonly status: "conflict"; readonly current: OperationSnapshot };

export type OperationQuery = {
  readonly build?: string;
  readonly command?: string;
  readonly endpoint?: string;
  readonly authority?: string;
  readonly route?: string;
  readonly runtimeClosure?: Digest;
};

export type OperationStore = {
  create(identity: OperationIdentity): Promise<OperationCreate>;
  read(id: Digest): Promise<OperationSnapshot | undefined>;
  list(query: OperationQuery): Promise<readonly OperationSnapshot[]>;
  compareAndSwap(id: Digest, expectedRevision: number, update: OperationUpdate): Promise<OperationStoreWrite>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

function epochMillisecond(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value >= 0, `${subject} must be a non-negative epoch millisecond`);
  return value;
}

function identityContent(value: Omit<OperationIdentity, "id">): Omit<OperationIdentity, "id"> {
  return {
    format: "svml.operation-identity@1",
    build: value.build,
    command: value.command,
    endpoint: value.endpoint,
    authority: value.authority,
    route: value.route,
    runtimeClosure: value.runtimeClosure,
    attempt: value.attempt,
  };
}

export function sealOperationIdentity(
  value: Omit<OperationIdentity, "format" | "id">,
): OperationIdentity {
  assert(value.build.trim().length > 0, "Operation build id is empty");
  assert(value.command.trim().length > 0, "Operation command id is empty");
  assert(value.endpoint.trim().length > 0, "Operation Endpoint id is empty");
  assert(value.authority.trim().length > 0, "Operation Provider Authority is empty");
  assert(value.route.trim().length > 0, "Operation Capability Route is empty");
  assert(isDigest(value.runtimeClosure), "Operation Runtime Closure digest is invalid");
  positiveInteger(value.attempt, "Operation attempt");
  const content = identityContent({
    format: "svml.operation-identity@1",
    ...value,
  });
  return { ...content, id: digestOf(content) };
}

export function verifyOperationIdentity(identity: OperationIdentity): void {
  const expected = sealOperationIdentity(identity);
  assert(identity.format === expected.format
    && identity.id === expected.id, "Operation identity differs");
}

export function verifyOperationSnapshot(snapshot: OperationSnapshot): void {
  verifyOperationIdentity(snapshot);
  assert(Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0, "Operation revision is invalid");
  const presence = [snapshot.checkpoint !== undefined, snapshot.completion !== undefined, snapshot.failure !== undefined]
    .filter(Boolean).length;
  if (snapshot.status === "created") assert(presence === 0, "created Operation carries mutable result state");
  if (snapshot.status === "pending") {
    assert(snapshot.checkpoint !== undefined && presence === 1, "pending Operation requires only a checkpoint");
    if (snapshot.wakeAt !== undefined) epochMillisecond(snapshot.wakeAt, "Operation wakeAt");
    if (snapshot.progress !== undefined) {
      assert(snapshot.progress.phase.trim().length > 0, "Operation progress phase is empty");
      if (snapshot.progress.completed !== undefined) {
        assert(Number.isFinite(snapshot.progress.completed) && snapshot.progress.completed >= 0,
          "Operation progress completed value is invalid");
      }
      if (snapshot.progress.total !== undefined) {
        assert(Number.isFinite(snapshot.progress.total) && snapshot.progress.total >= 0,
          "Operation progress total value is invalid");
      }
      if (snapshot.progress.completed !== undefined && snapshot.progress.total !== undefined) {
        assert(snapshot.progress.completed <= snapshot.progress.total,
          "Operation progress exceeds its total");
      }
      if (snapshot.progress.unit !== undefined) {
        assert(snapshot.progress.unit.trim().length > 0, "Operation progress unit is empty");
      }
    }
  } else {
    assert(snapshot.wakeAt === undefined, `${snapshot.status} Operation cannot carry wakeAt`);
    assert(snapshot.progress === undefined, `${snapshot.status} Operation cannot carry progress`);
  }
  if (snapshot.status === "completed") {
    assert(snapshot.completion !== undefined && presence === 1, "completed Operation requires only completion");
  }
  if (snapshot.status === "failed") {
    assert(snapshot.failure !== undefined && presence === 1, "failed Operation requires only failure");
    assert(snapshot.failure.code.trim().length > 0 && snapshot.failure.message.trim().length > 0, "Operation failure is invalid");
    if (snapshot.failure.retryAt !== undefined) {
      assert(snapshot.failure.retryable, "non-retryable Operation failure cannot carry retryAt");
      epochMillisecond(snapshot.failure.retryAt, "Operation failure retryAt");
    }
  }
  if (snapshot.status === "cancelled") {
    assert(presence === 0, "cancelled Operation cannot carry execution result state");
    assert(snapshot.cancellation?.status === "confirmed", "cancelled Operation requires confirmed cancellation");
  }
  if (snapshot.cancellation !== undefined) verifyOperationCancellationControl(snapshot.id, snapshot.cancellation);
}

export function operationCancellationRequestId(operation: Digest, requestedAt: number): Digest {
  epochMillisecond(requestedAt, "Operation cancellation requestedAt");
  return digestOf({ format: "svml.operation-cancellation-request@1", operation, requestedAt });
}

function verifyOperationCancellationControl(
  operation: Digest,
  control: OperationCancellationControl,
): void {
  epochMillisecond(control.requestedAt, "Operation cancellation requestedAt");
  assert(control.requestId === operationCancellationRequestId(operation, control.requestedAt),
    "Operation cancellation request identity differs");
  assert(["requested", "accepted", "confirmed", "unsupported", "too-late"].includes(control.status),
    "Operation cancellation status is invalid");
  assert(Number.isSafeInteger(control.attempts) && control.attempts >= 0,
    "Operation cancellation attempts is invalid");
  if (control.retryAt !== undefined) epochMillisecond(control.retryAt, "Operation cancellation retryAt");
  if (control.lastError !== undefined) {
    assert(control.lastError.code.trim().length > 0 && control.lastError.message.trim().length > 0,
      "Operation cancellation error is invalid");
  }
}

function copy(snapshot: OperationSnapshot): OperationSnapshot {
  return structuredClone(snapshot);
}

/** In-process reference Store. Durable/distributed adapters must preserve the same CAS law. */
export class MemoryOperationStore implements OperationStore {
  readonly #operations = new Map<Digest, OperationSnapshot>();

  async create(identity: OperationIdentity): Promise<OperationCreate> {
    verifyOperationIdentity(identity);
    const existing = this.#operations.get(identity.id);
    if (existing !== undefined) return { status: "existing", snapshot: copy(existing) };
    const snapshot: OperationSnapshot = {
      ...structuredClone(identity),
      revision: 0,
      status: "created",
    };
    verifyOperationSnapshot(snapshot);
    this.#operations.set(snapshot.id, snapshot);
    return { status: "created", snapshot: copy(snapshot) };
  }

  async read(id: Digest): Promise<OperationSnapshot | undefined> {
    const snapshot = this.#operations.get(id);
    return snapshot === undefined ? undefined : copy(snapshot);
  }

  async list(query: OperationQuery): Promise<readonly OperationSnapshot[]> {
    return [...this.#operations.values()]
      .filter((snapshot) => query.build === undefined || snapshot.build === query.build)
      .filter((snapshot) => query.command === undefined || snapshot.command === query.command)
      .filter((snapshot) => query.endpoint === undefined || snapshot.endpoint === query.endpoint)
      .filter((snapshot) => query.authority === undefined || snapshot.authority === query.authority)
      .filter((snapshot) => query.route === undefined || snapshot.route === query.route)
      .filter((snapshot) => query.runtimeClosure === undefined || snapshot.runtimeClosure === query.runtimeClosure)
      .sort((left, right) => left.attempt - right.attempt || left.id.localeCompare(right.id))
      .map(copy);
  }

  async compareAndSwap(
    id: Digest,
    expectedRevision: number,
    update: OperationUpdate,
  ): Promise<OperationStoreWrite> {
    assert(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, "expected Operation revision is invalid");
    const current = this.#operations.get(id);
    assert(current !== undefined, `Operation ${id} does not exist`);
    if (current.revision !== expectedRevision) return { status: "conflict", current: copy(current) };
    if (update.status !== "control") {
      assert(current.status !== "completed" && current.status !== "failed" && current.status !== "cancelled",
        `Operation ${id} is already terminal`);
    }
    const mutable = update.status === "control"
      ? {
          status: current.status,
          ...(current.checkpoint === undefined ? {} : { checkpoint: structuredClone(current.checkpoint) }),
          ...(current.wakeAt === undefined ? {} : { wakeAt: current.wakeAt }),
          ...(current.progress === undefined ? {} : { progress: structuredClone(current.progress) }),
          ...(current.completion === undefined ? {} : { completion: structuredClone(current.completion) }),
          ...(current.failure === undefined ? {} : { failure: structuredClone(current.failure) }),
          cancellation: structuredClone(update.cancellation),
        }
      : update.status === "pending"
      ? {
          status: "pending" as const,
          checkpoint: structuredClone(update.checkpoint),
          ...(update.wakeAt === undefined ? {} : { wakeAt: epochMillisecond(update.wakeAt, "Operation wakeAt") }),
          ...(update.progress === undefined ? {} : { progress: structuredClone(update.progress) }),
        }
        : update.status === "completed"
        ? { status: "completed" as const, completion: structuredClone(update.completion) }
        : update.status === "failed"
          ? { status: "failed" as const, failure: structuredClone(update.failure) }
          : { status: "cancelled" as const, cancellation: structuredClone(update.cancellation) };
    const snapshot: OperationSnapshot = {
      format: current.format,
      id: current.id,
      build: current.build,
      command: current.command,
      endpoint: current.endpoint,
      authority: current.authority,
      route: current.route,
      runtimeClosure: current.runtimeClosure,
      attempt: current.attempt,
      revision: current.revision + 1,
      ...mutable,
      ...(update.status === "control" || update.status === "cancelled" || current.cancellation === undefined
        ? {} : { cancellation: structuredClone(current.cancellation) }),
    };
    verifyOperationSnapshot(snapshot);
    this.#operations.set(id, snapshot);
    return { status: "stored", snapshot: copy(snapshot) };
  }
}
