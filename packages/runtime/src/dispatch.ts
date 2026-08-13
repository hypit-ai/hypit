import { canonicalize, digestOf, isDigest } from "@narratage/protocol";
import type { CanonicalValue, Digest } from "@narratage/protocol";

export type DispatchAdmission = "open" | "closing" | "closed";
export type DispatchPhase = "queued" | "leased" | "waiting" | "blocked" | "settling" | "terminal";
export type DispatchTerminal = "complete" | "failed" | "cancelled";

export type DispatchLease = {
  readonly owner: string;
  readonly token: string;
  /** Monotonic fencing value. A stale owner can never commit with an older fence. */
  readonly fence: number;
  readonly expiresAt: number;
};

export type BuildDispatchIdentity = {
  readonly format: "svml.build-dispatch-identity@1";
  readonly id: Digest;
  readonly build: string;
  readonly core: Digest;
  /** Exact execution revision for Runtime services and Endpoint deployment. */
  readonly runtimeRevision: Digest;
};

export type BuildDispatchSnapshot = BuildDispatchIdentity & {
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly priority: number;
  readonly availableAt: number;
  readonly admission: DispatchAdmission;
  readonly phase: DispatchPhase;
  readonly lease?: DispatchLease;
  readonly reason?: string;
  readonly cancellation?: {
    readonly requestedAt: number;
    readonly reason?: string;
  };
  readonly terminal?: DispatchTerminal;
};

export type BuildDispatchCreate =
  | { readonly status: "created"; readonly snapshot: BuildDispatchSnapshot }
  | { readonly status: "existing"; readonly snapshot: BuildDispatchSnapshot };

export type BuildDispatchClaim = {
  /** Exact Runtime Revision this Worker can execute. Claims are filtered before leasing. */
  readonly runtimeRevision: Digest;
  readonly owner: string;
  readonly token: string;
  readonly now: number;
  readonly leaseMs: number;
};

export type BuildDispatchRelease = {
  readonly phase: "queued" | "waiting" | "blocked" | "settling";
  readonly availableAt: number;
  readonly reason?: string;
};

export type DispatchQuery = {
  readonly phases?: readonly DispatchPhase[];
  readonly admission?: DispatchAdmission;
};

export const nonTerminalDispatchPhases = [
  "queued",
  "leased",
  "waiting",
  "blocked",
  "settling",
] as const satisfies readonly DispatchPhase[];

export type CapacityMode = "active" | "recoverable";

export type CapacityLimits = {
  readonly globalActive: number;
};

export type CapacityResourceClaim = {
  readonly id: string;
  readonly maxActive: number;
  readonly maxInFlight: number;
};

export type CapacityReservation = {
  readonly format: "svml.capacity-reservation@1";
  readonly id: Digest;
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly queue?: {
    readonly authority: string;
    readonly route: string;
  };
  readonly mode: CapacityMode;
  readonly inFlight: boolean;
  readonly active?: DispatchLease;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type CapacityAcquireRequest = {
  readonly build: string;
  readonly command: string;
  readonly resources: readonly CapacityResourceClaim[];
  readonly queue?: CapacityReservation["queue"];
  readonly mode: CapacityMode;
  /** Current Build authority; a stale Worker cannot reserve capacity after being fenced. */
  readonly buildLease: DispatchLease;
  readonly owner: string;
  readonly token: string;
  readonly now: number;
  readonly leaseMs: number;
  readonly limits: CapacityLimits;
};

export type CapacityAcquire =
  | { readonly status: "acquired"; readonly reservation: CapacityReservation }
  | {
      readonly status: "blocked";
      readonly retryAt: number;
      readonly reason: "global-active" | "resource-active" | "resource-in-flight";
      readonly resource?: string;
    };

/**
 * Durable execution control for Build identities, leases and shared capacity.
 *
 * It deliberately stores no Core Command body. `command` is only the identity regenerated from
 * verified BuildState by the Worker. Provider checkpoints remain in OperationStore.
 */
export type BuildDispatchStore = {
  create(identity: BuildDispatchIdentity, options?: { readonly priority?: number; readonly availableAt?: number; readonly now?: number }): Promise<BuildDispatchCreate>;
  read(build: string): Promise<BuildDispatchSnapshot | undefined>;
  list(query?: DispatchQuery): Promise<readonly BuildDispatchSnapshot[]>;
  claim(request: BuildDispatchClaim): Promise<BuildDispatchSnapshot | undefined>;
  heartbeat(build: string, lease: DispatchLease, now: number, leaseMs: number): Promise<BuildDispatchSnapshot>;
  release(build: string, lease: DispatchLease, update: BuildDispatchRelease, now?: number): Promise<BuildDispatchSnapshot>;
  finish(build: string, lease: DispatchLease, terminal: DispatchTerminal, reason?: string, now?: number): Promise<BuildDispatchSnapshot>;
  requestCancellation(build: string, reason?: string, now?: number): Promise<BuildDispatchSnapshot>;
  /** Make non-terminal work immediately claimable without changing admission or creative intent. */
  wake(build: string, now?: number): Promise<BuildDispatchSnapshot>;
  acquireCapacity(request: CapacityAcquireRequest): Promise<CapacityAcquire>;
  heartbeatCapacity(id: Digest, lease: DispatchLease, now: number, leaseMs: number): Promise<CapacityReservation>;
  parkCapacity(id: Digest, lease: DispatchLease, inFlight: boolean, now?: number): Promise<CapacityReservation>;
  releaseCapacity(id: Digest, lease: DispatchLease, now?: number): Promise<void>;
  /** Remove a parked reservation only while holding the owning Build's current fenced lease. */
  clearCapacity(id: Digest, build: string, buildLease: DispatchLease): Promise<void>;
  listCapacity(): Promise<readonly CapacityReservation[]>;
};

export type RuntimeJournalKind =
  | "dispatch-created"
  | "dispatch-claimed"
  | "dispatch-released"
  | "dispatch-terminal"
  | "cancellation-requested"
  | "worker-started"
  | "worker-stopped"
  | "capacity-acquired"
  | "capacity-released"
  | "operation-control";

export type RuntimeJournalEntry = {
  readonly format: "svml.runtime-journal-entry@1";
  readonly sequence: number;
  readonly at: number;
  readonly kind: RuntimeJournalKind;
  readonly build?: string;
  readonly operation?: Digest;
  readonly worker?: string;
  readonly detail: CanonicalValue;
};

export type RuntimeJournalQuery = {
  readonly after?: number;
  readonly build?: string;
  readonly operation?: Digest;
  readonly worker?: string;
  readonly limit?: number;
};

export type RuntimeJournal = {
  append(entry: Omit<RuntimeJournalEntry, "format" | "sequence">): Promise<RuntimeJournalEntry>;
  list(query?: RuntimeJournalQuery): Promise<readonly RuntimeJournalEntry[]>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeNonNegative(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value >= 0, `${subject} must be a non-negative safe integer`);
  return value;
}

function positive(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

export function createBuildDispatchIdentity(input: {
  readonly build: string;
  readonly core: Digest;
  readonly runtimeRevision: Digest;
}): BuildDispatchIdentity {
  assert(input.build.trim().length > 0, "Build Dispatch build id is empty");
  assert(isDigest(input.core), "Build Dispatch Core digest is invalid");
  assert(isDigest(input.runtimeRevision), "Build Dispatch Runtime Revision digest is invalid");
  const content = {
    format: "svml.build-dispatch-identity@1" as const,
    build: input.build,
    core: input.core,
    runtimeRevision: input.runtimeRevision,
  };
  return { ...content, id: digestOf(content) };
}

export function createRuntimeRevision(input: {
  readonly runtimeClosure: Digest;
  readonly runtimePackageClosure?: Digest;
}): Digest {
  assert(isDigest(input.runtimeClosure), "Runtime Revision Runtime Closure digest is invalid");
  assert(input.runtimePackageClosure === undefined || isDigest(input.runtimePackageClosure),
    "Runtime Revision Runtime package closure digest is invalid");
  return digestOf({
    format: "svml.runtime-revision@1",
    runtimeClosure: input.runtimeClosure,
    runtimePackageClosure: input.runtimePackageClosure ?? null,
  });
}

export function verifyBuildDispatchIdentity(value: BuildDispatchIdentity): void {
  const expected = createBuildDispatchIdentity(value);
  assert(value.format === expected.format && value.id === expected.id, "Build Dispatch identity differs");
}

export function verifyDispatchLease(value: DispatchLease, subject = "Dispatch lease"): void {
  assert(value.owner.trim().length > 0, `${subject} owner is empty`);
  assert(value.token.trim().length > 0, `${subject} token is empty`);
  positive(value.fence, `${subject} fence`);
  safeNonNegative(value.expiresAt, `${subject} expiry`);
}

export function verifyBuildDispatchSnapshot(value: BuildDispatchSnapshot): void {
  verifyBuildDispatchIdentity(value);
  safeNonNegative(value.revision, "Build Dispatch revision");
  safeNonNegative(value.createdAt, "Build Dispatch createdAt");
  safeNonNegative(value.updatedAt, "Build Dispatch updatedAt");
  assert(Number.isSafeInteger(value.priority), "Build Dispatch priority must be a safe integer");
  safeNonNegative(value.availableAt, "Build Dispatch availableAt");
  assert(["open", "closing", "closed"].includes(value.admission), "Build Dispatch admission is invalid");
  assert(["queued", "leased", "waiting", "blocked", "settling", "terminal"].includes(value.phase), "Build Dispatch phase is invalid");
  if (value.lease !== undefined) verifyDispatchLease(value.lease);
  assert((value.phase === "leased") === (value.lease !== undefined), "only a leased Dispatch may carry a lease");
  assert((value.phase === "terminal") === (value.terminal !== undefined), "only a terminal Dispatch may carry a terminal outcome");
  if (value.phase === "terminal") assert(value.admission === "closed", "terminal Dispatch admission must be closed");
  if (value.cancellation !== undefined) safeNonNegative(value.cancellation.requestedAt, "cancellation requestedAt");
}

/**
 * One DispatchStore is one execution domain. It may admit only one Runtime Revision while work is
 * unfinished. This keeps execution honest without retaining old code or inventing a multi-version
 * Worker supervisor. A caller that intentionally wants another execution domain selects another
 * DispatchStore.
 */
export function assertRuntimeRevisionAdmission(
  runtimeRevision: Digest,
  dispatches: readonly BuildDispatchSnapshot[],
): void {
  assert(isDigest(runtimeRevision), "Runtime Revision digest is invalid");
  const conflicts = dispatches
    .filter((item) => item.phase !== "terminal" && item.runtimeRevision !== runtimeRevision)
    .sort((left, right) => left.build.localeCompare(right.build));
  if (conflicts.length === 0) return;
  throw new Error([
    `Runtime Revision ${runtimeRevision} cannot enter this execution domain while unfinished Builds belong to another revision:`,
    ...conflicts.map((item) => `  ${item.build} · ${item.phase} · ${item.runtimeRevision}`),
    "Finish or cancel those Builds with their original Runtime Profile, restore that Profile and its package locks, or select another DispatchStore.",
  ].join("\n"));
}

export function capacityReservationId(build: string, command: string): Digest {
  assert(build.trim().length > 0 && command.trim().length > 0, "Capacity reservation identity is empty");
  return digestOf({ format: "svml.capacity-reservation-identity@1", build, command });
}

export function verifyCapacityLimits(value: CapacityLimits): void {
  positive(value.globalActive, "global active capacity");
}

export function verifyCapacityReservation(value: CapacityReservation): void {
  assert(value.format === "svml.capacity-reservation@1", "Capacity reservation format is unsupported");
  assert(value.id === capacityReservationId(value.build, value.command), "Capacity reservation identity differs");
  assert(value.resources.length > 0, "Capacity reservation resources are empty");
  const resources = value.resources.map((resource) => {
    assert(resource.id.trim().length > 0, "Capacity resource id is empty");
    positive(resource.maxActive, `Capacity resource ${resource.id} active limit`);
    positive(resource.maxInFlight, `Capacity resource ${resource.id} in-flight limit`);
    return resource.id;
  });
  assert(new Set(resources).size === resources.length, "Capacity reservation repeats a resource");
  if (value.queue !== undefined) {
    assert(value.queue.authority.trim().length > 0, "Capacity queue authority is empty");
    assert(value.queue.route.trim().length > 0, "Capacity queue route is empty");
  }
  assert(value.mode === "active" || value.mode === "recoverable", "Capacity reservation mode is invalid");
  if (value.active !== undefined) verifyDispatchLease(value.active, "Capacity lease");
  safeNonNegative(value.createdAt, "Capacity reservation createdAt");
  safeNonNegative(value.updatedAt, "Capacity reservation updatedAt");
}

export function verifyRuntimeJournalEntry(value: RuntimeJournalEntry): void {
  assert(value.format === "svml.runtime-journal-entry@1", "Runtime Journal entry format is unsupported");
  positive(value.sequence, "Runtime Journal sequence");
  safeNonNegative(value.at, "Runtime Journal timestamp");
  assert([
    "dispatch-created", "dispatch-claimed", "dispatch-released", "dispatch-terminal",
    "cancellation-requested", "worker-started", "worker-stopped", "capacity-acquired",
    "capacity-released", "operation-control",
  ].includes(value.kind), "Runtime Journal kind is invalid");
  if (value.operation !== undefined) assert(isDigest(value.operation), "Runtime Journal Operation digest is invalid");
  canonicalize(value.detail);
}
