import { digestOf, isDigest } from "@svml/protocol";
import type {
  CanonicalValue,
  Conformance,
  Delivery,
  Digest,
  StoredValue,
} from "@svml/protocol";

export type OperationIdentity = {
  readonly format: "svml.operation-identity@1";
  readonly id: Digest;
  readonly build: string;
  readonly command: string;
  readonly endpoint: string;
  readonly implementationDigest: Digest;
  readonly runtimeClosure: Digest;
  readonly requestDigest: Digest;
  readonly attempt: number;
  readonly submissionKey: Digest;
};

export type OperationCompletion = {
  readonly value: StoredValue;
  readonly conformance: Conformance;
  readonly delivery: Delivery;
  readonly metadata: CanonicalValue;
  readonly digest: Digest;
};

export type OperationFailure = {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  /** Earliest epoch millisecond at which Runtime policy may create another attempt. */
  readonly retryAt?: number;
};

export type OperationSnapshot = OperationIdentity & {
  readonly revision: number;
  readonly status: "created" | "pending" | "completed" | "failed";
  readonly checkpoint?: CanonicalValue;
  readonly wakeAt?: number;
  readonly completion?: OperationCompletion;
  readonly failure?: OperationFailure;
};

export type OperationUpdate =
  | { readonly status: "pending"; readonly checkpoint: CanonicalValue; readonly wakeAt?: number }
  | {
      readonly status: "completed";
      readonly completion: Omit<OperationCompletion, "digest">;
    }
  | { readonly status: "failed"; readonly failure: OperationFailure };

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
  readonly runtimeClosure?: Digest;
  readonly requestDigest?: Digest;
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

function submissionContent(value: {
  readonly build: string;
  readonly command: string;
  readonly endpoint: string;
  readonly implementationDigest: Digest;
  readonly runtimeClosure: Digest;
  readonly requestDigest: Digest;
  readonly attempt: number;
}) {
  return {
    format: "svml.operation-submission@1",
    build: value.build,
    command: value.command,
    endpoint: value.endpoint,
    implementationDigest: value.implementationDigest,
    runtimeClosure: value.runtimeClosure,
    requestDigest: value.requestDigest,
    attempt: value.attempt,
  } as const;
}

function identityContent(value: Omit<OperationIdentity, "id">): Omit<OperationIdentity, "id"> {
  return {
    format: "svml.operation-identity@1",
    build: value.build,
    command: value.command,
    endpoint: value.endpoint,
    implementationDigest: value.implementationDigest,
    runtimeClosure: value.runtimeClosure,
    requestDigest: value.requestDigest,
    attempt: value.attempt,
    submissionKey: value.submissionKey,
  };
}

export function sealOperationIdentity(
  value: Omit<OperationIdentity, "format" | "id" | "submissionKey">,
): OperationIdentity {
  assert(value.build.trim().length > 0, "Operation build id is empty");
  assert(value.command.trim().length > 0, "Operation command id is empty");
  assert(value.endpoint.trim().length > 0, "Operation Endpoint id is empty");
  assert(isDigest(value.implementationDigest), "Operation implementation digest is invalid");
  assert(isDigest(value.runtimeClosure), "Operation Runtime Closure digest is invalid");
  assert(isDigest(value.requestDigest), "Operation request digest is invalid");
  positiveInteger(value.attempt, "Operation attempt");
  const submissionKey = digestOf(submissionContent(value));
  const content = identityContent({
    format: "svml.operation-identity@1",
    ...value,
    submissionKey,
  });
  return { ...content, id: digestOf(content) };
}

export function verifyOperationIdentity(identity: OperationIdentity): void {
  const expected = sealOperationIdentity(identity);
  assert(identity.format === expected.format
    && identity.id === expected.id
    && identity.submissionKey === expected.submissionKey, "Operation identity differs");
}

function completionContent(value: Omit<OperationCompletion, "digest">) {
  return {
    value: structuredClone(value.value),
    conformance: value.conformance,
    delivery: value.delivery,
    metadata: structuredClone(value.metadata),
  };
}

export function sealOperationCompletion(
  value: Omit<OperationCompletion, "digest">,
): OperationCompletion {
  const content = completionContent(value);
  return { ...content, digest: digestOf(content) };
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
  } else {
    assert(snapshot.wakeAt === undefined, `${snapshot.status} Operation cannot carry wakeAt`);
  }
  if (snapshot.status === "completed") {
    assert(snapshot.completion !== undefined && presence === 1, "completed Operation requires only completion");
    const expected = sealOperationCompletion(snapshot.completion);
    assert(snapshot.completion.digest === expected.digest, "Operation completion digest differs");
  }
  if (snapshot.status === "failed") {
    assert(snapshot.failure !== undefined && presence === 1, "failed Operation requires only failure");
    assert(snapshot.failure.code.trim().length > 0 && snapshot.failure.message.trim().length > 0, "Operation failure is invalid");
    if (snapshot.failure.retryAt !== undefined) {
      assert(snapshot.failure.retryable, "non-retryable Operation failure cannot carry retryAt");
      epochMillisecond(snapshot.failure.retryAt, "Operation failure retryAt");
    }
  }
}

function copy(snapshot: OperationSnapshot): OperationSnapshot {
  return structuredClone(snapshot);
}

/** In-process reference journal. Durable/distributed adapters must add leases around the same CAS law. */
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
      .filter((snapshot) => query.runtimeClosure === undefined || snapshot.runtimeClosure === query.runtimeClosure)
      .filter((snapshot) => query.requestDigest === undefined || snapshot.requestDigest === query.requestDigest)
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
    assert(current.status !== "completed" && current.status !== "failed", `Operation ${id} is already terminal`);
    const mutable = update.status === "pending"
      ? {
          status: "pending" as const,
          checkpoint: structuredClone(update.checkpoint),
          ...(update.wakeAt === undefined ? {} : { wakeAt: epochMillisecond(update.wakeAt, "Operation wakeAt") }),
        }
      : update.status === "completed"
        ? { status: "completed" as const, completion: sealOperationCompletion(update.completion) }
        : { status: "failed" as const, failure: structuredClone(update.failure) };
    const snapshot: OperationSnapshot = {
      format: current.format,
      id: current.id,
      build: current.build,
      command: current.command,
      endpoint: current.endpoint,
      implementationDigest: current.implementationDigest,
      runtimeClosure: current.runtimeClosure,
      requestDigest: current.requestDigest,
      attempt: current.attempt,
      submissionKey: current.submissionKey,
      revision: current.revision + 1,
      ...mutable,
    };
    verifyOperationSnapshot(snapshot);
    this.#operations.set(id, snapshot);
    return { status: "stored", snapshot: copy(snapshot) };
  }
}
