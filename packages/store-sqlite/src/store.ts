import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalStringify,
  verifyBuildState,
} from "@narratage/core";
import { digestOf } from "@narratage/protocol";
import type {
  BuildState,
  Digest,
} from "@narratage/protocol";
import {
  assertRuntimeClosureAdmission,
  sameBuildCatalogDescriptor,
  verifyBuildCatalogDescriptor,
  verifyBuildCatalogEntry,
  defineRuntimeComponentPackage,
  capacityReservationId,
  verifyBuildDispatchIdentity,
  verifyBuildDispatchSnapshot,
  verifyCapacityLimits,
  verifyCapacityReservation,
  verifyDispatchLease,
  verifyOperationIdentity,
  verifyOperationSnapshot,
} from "@narratage/runtime";
import type {
  BuildDispatchClaim,
  BuildDispatchCreate,
  BuildDispatchIdentity,
  BuildDispatchRelease,
  BuildDispatchSnapshot,
  BuildDispatchStore,
  BuildCatalog,
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildSnapshot,
  BuildStore,
  BuildStoreWrite,
  CapacityAcquire,
  CapacityAcquireRequest,
  CapacityReservation,
  DispatchLease,
  DispatchQuery,
  OperationCreate,
  OperationIdentity,
  OperationQuery,
  OperationSnapshot,
  OperationStore,
  OperationStoreWrite,
  OperationUpdate,
  RuntimeComponentPackage,
} from "@narratage/runtime";

const databaseSchemaVersion = 6;

export const sqliteStoreModuleRef = {
  name: "@narratage/store-sqlite",
  version: "1",
} as const;

export const sqliteBuildStoreImplementationDigest = digestOf(
  "@narratage/store-sqlite/build-store@1",
);

export const sqliteOperationStoreImplementationDigest = digestOf(
  "@narratage/store-sqlite/operation-store@1",
);

export const sqliteDispatchStoreImplementationDigest = digestOf(
  "@narratage/store-sqlite/dispatch-store@1",
);

export type SqliteRuntimeStateOptions = {
  readonly busyTimeoutMs?: number;
  /** Open an existing archive without creating files or schema. */
  readonly readOnly?: boolean;
};

export type CreateSqliteRuntimeComponentPackageOptions = SqliteRuntimeStateOptions & {
  readonly path: string;
  readonly buildInstance?: string;
  readonly operationInstance?: string;
  readonly dispatchInstance?: string;
};

type Row = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

function nonNegativeInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value >= 0, `${subject} must be a non-negative safe integer`);
  return value;
}

function transaction<T>(database: DatabaseSync, body: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = body();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function durableBuildState(state: BuildState): BuildState {
  const normalized = { ...structuredClone(state), outstanding: [] };
  verifyBuildState(normalized);
  return normalized;
}

function parseBuildSnapshot(row: Row): BuildSnapshot {
  assert(typeof row.build_id === "string", "SQLite Build row has no build id");
  assert(typeof row.revision === "number", "SQLite Build row has no revision");
  assert(typeof row.state_json === "string", "SQLite Build row has no state");
  const state = JSON.parse(row.state_json) as BuildState;
  verifyBuildState(state);
  assert(state.outstanding.length === 0, "durable BuildState contains derived outstanding Commands");
  return { build: row.build_id, revision: row.revision, state };
}

function operationIdentity(snapshot: OperationSnapshot): OperationIdentity {
  return {
    format: snapshot.format,
    id: snapshot.id,
    build: snapshot.build,
    command: snapshot.command,
    endpoint: snapshot.endpoint,
    authority: snapshot.authority,
    route: snapshot.route,
    runtimeClosure: snapshot.runtimeClosure,
    attempt: snapshot.attempt,
  };
}

function parseOperationSnapshot(row: Row): OperationSnapshot {
  assert(typeof row.identity_json === "string", "SQLite Operation row has no identity");
  assert(typeof row.revision === "number", "SQLite Operation row has no revision");
  assert(typeof row.status === "string", "SQLite Operation row has no status");
  const identity = JSON.parse(row.identity_json) as OperationIdentity;
  const pending = row.status === "pending"
    ? JSON.parse(String(row.checkpoint_json)) as {
        readonly format?: string;
        readonly checkpoint?: unknown;
        readonly wakeAt?: number;
        readonly progress?: OperationSnapshot["progress"];
      }
    : undefined;
  if (row.status === "pending") {
    assert(pending?.format === "svml.operation-pending@1" && pending.checkpoint !== undefined,
      "SQLite pending Operation has an unsupported checkpoint envelope");
  }
  const mutable = row.status === "pending"
    ? {
        checkpoint: pending!.checkpoint,
        ...(pending!.wakeAt === undefined ? {} : { wakeAt: pending!.wakeAt }),
        ...(pending!.progress === undefined ? {} : { progress: pending!.progress }),
      }
    : row.status === "completed"
      ? { completion: JSON.parse(String(row.completion_json)) }
      : row.status === "failed"
        ? { failure: JSON.parse(String(row.failure_json)) }
        : {};
  const cancellation = typeof row.cancellation_json === "string"
    ? { cancellation: JSON.parse(row.cancellation_json) }
    : {};
  const snapshot = {
    ...identity,
    revision: row.revision,
    status: row.status,
    ...mutable,
    ...cancellation,
  } as OperationSnapshot;
  verifyOperationSnapshot(snapshot);
  return snapshot;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

class SqliteBuildStore implements BuildStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async create(build: string, state: BuildState): Promise<BuildSnapshot> {
    assert(build.trim().length > 0, "build id must not be empty");
    const durable = durableBuildState(state);
    const result = this.#database.prepare(`
      INSERT OR IGNORE INTO svml_builds (build_id, revision, state_json)
      VALUES (?, 0, ?)
    `).run(build, canonicalStringify(durable));
    if (result.changes !== 1) throw new Error(`build ${build} already exists`);
    return { build, revision: 0, state: copy(durable) };
  }

  async read(build: string): Promise<BuildSnapshot | undefined> {
    const row = this.#database.prepare(`
      SELECT build_id, revision, state_json
      FROM svml_builds
      WHERE build_id = ?
    `).get(build) as Row | undefined;
    return row === undefined ? undefined : parseBuildSnapshot(row);
  }

  async list(): Promise<readonly BuildSnapshot[]> {
    const rows = this.#database.prepare(`
      SELECT build_id, revision, state_json
      FROM svml_builds
      ORDER BY build_id ASC
    `).all() as Row[];
    return rows.map(parseBuildSnapshot);
  }

  async compareAndSwap(
    build: string,
    expectedRevision: number,
    state: BuildState,
  ): Promise<BuildStoreWrite> {
    assert(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, "expected revision is invalid");
    const durable = durableBuildState(state);
    const result = this.#database.prepare(`
      UPDATE svml_builds
      SET revision = ?, state_json = ?
      WHERE build_id = ? AND revision = ?
    `).run(expectedRevision + 1, canonicalStringify(durable), build, expectedRevision);
    if (result.changes === 1) {
      return {
        status: "stored",
        snapshot: { build, revision: expectedRevision + 1, state: copy(durable) },
      };
    }
    const current = await this.read(build);
    if (current === undefined) throw new Error(`build ${build} does not exist`);
    return { status: "conflict", current };
  }
}

function parseCatalogEntry(row: Row): BuildCatalogEntry {
  assert(typeof row.build_id === "string", "SQLite Build Catalog row has no build id");
  assert(typeof row.created_at === "number", "SQLite Build Catalog row has no creation time");
  assert(typeof row.updated_at === "number", "SQLite Build Catalog row has no update time");
  assert(typeof row.descriptor_json === "string", "SQLite Build Catalog row has no descriptor");
  const descriptor = JSON.parse(row.descriptor_json) as BuildCatalogDescriptor;
  const entry = {
    ...descriptor,
    build: row.build_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  verifyBuildCatalogEntry(entry);
  return entry;
}

class SqliteBuildCatalog implements BuildCatalog {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async record(build: string, descriptor: BuildCatalogDescriptor): Promise<BuildCatalogEntry> {
    assert(build.trim().length > 0, "Build Catalog build id must not be empty");
    verifyBuildCatalogDescriptor(descriptor);
    const existing = await this.read(build);
    if (existing !== undefined) {
      assert(sameBuildCatalogDescriptor(existing, descriptor),
        `Build Catalog ${build} already has another source, Run Source or output naming`);
      return existing;
    }
    const now = Date.now();
    this.#database.prepare(`
      INSERT OR IGNORE INTO svml_build_catalog (
        build_id, core_id, created_at, updated_at, descriptor_json
      ) VALUES (?, ?, ?, ?, ?)
    `).run(build, descriptor.core, now, now, canonicalStringify(descriptor));
    const stored = await this.read(build);
    if (stored === undefined) throw new Error(`Build Catalog ${build} disappeared after record`);
    assert(sameBuildCatalogDescriptor(stored, descriptor),
      `Build Catalog ${build} already has another source, Run Source or output naming`);
    return stored;
  }

  async read(build: string): Promise<BuildCatalogEntry | undefined> {
    const row = this.#database.prepare(`
      SELECT build_id, created_at, updated_at, descriptor_json
      FROM svml_build_catalog
      WHERE build_id = ?
    `).get(build) as Row | undefined;
    return row === undefined ? undefined : parseCatalogEntry(row);
  }

  async list(): Promise<readonly BuildCatalogEntry[]> {
    const rows = this.#database.prepare(`
      SELECT build_id, created_at, updated_at, descriptor_json
      FROM svml_build_catalog
      ORDER BY created_at DESC, build_id ASC
    `).all() as Row[];
    return rows.map(parseCatalogEntry);
  }
}

class SqliteOperationStore implements OperationStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async create(identity: OperationIdentity): Promise<OperationCreate> {
    verifyOperationIdentity(identity);
    const result = this.#database.prepare(`
      INSERT OR IGNORE INTO svml_operations (
        operation_id, revision, status, identity_json,
        checkpoint_json, completion_json, failure_json, cancellation_json
      ) VALUES (?, 0, 'created', ?, NULL, NULL, NULL, NULL)
    `).run(identity.id, canonicalStringify(identity));
    const snapshot: OperationSnapshot = {
      ...copy(identity),
      revision: 0,
      status: "created",
    };
    if (result.changes === 1) return { status: "created", snapshot };
    const existing = await this.read(identity.id);
    if (existing === undefined) throw new Error(`operation ${identity.id} disappeared after create`);
    assert(canonicalStringify(operationIdentity(existing)) === canonicalStringify(identity),
      `operation ${identity.id} identity differs from its stored value`);
    return { status: "existing", snapshot: existing };
  }

  async read(id: Digest): Promise<OperationSnapshot | undefined> {
    const row = this.#database.prepare(`
      SELECT identity_json, revision, status, checkpoint_json, completion_json, failure_json, cancellation_json
      FROM svml_operations
      WHERE operation_id = ?
    `).get(id) as Row | undefined;
    return row === undefined ? undefined : parseOperationSnapshot(row);
  }

  async list(query: OperationQuery): Promise<readonly OperationSnapshot[]> {
    const predicates: string[] = [];
    const values: string[] = [];
    for (const [field, value] of [
      ["build", query.build],
      ["command", query.command],
      ["endpoint", query.endpoint],
      ["authority", query.authority],
      ["route", query.route],
      ["runtimeClosure", query.runtimeClosure],
    ] as const) {
      if (value === undefined) continue;
      predicates.push(`json_extract(identity_json, '$.${field}') = ?`);
      values.push(value);
    }
    const rows = this.#database.prepare(`
      SELECT identity_json, revision, status, checkpoint_json, completion_json, failure_json, cancellation_json
      FROM svml_operations
      ${predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`}
      ORDER BY operation_id ASC
    `).all(...values) as Row[];
    return rows.map(parseOperationSnapshot)
      .sort((left, right) => left.attempt - right.attempt || left.id.localeCompare(right.id));
  }

  async compareAndSwap(
    id: Digest,
    expectedRevision: number,
    update: OperationUpdate,
  ): Promise<OperationStoreWrite> {
    assert(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0, "expected Operation revision is invalid");
    const current = await this.read(id);
    if (current === undefined) throw new Error(`Operation ${id} does not exist`);
    if (current.revision !== expectedRevision) return { status: "conflict", current };
    if (update.status !== "control") {
      assert(current.status !== "completed" && current.status !== "failed" && current.status !== "cancelled",
        `Operation ${id} is already terminal`);
    }
    if (update.status === "control") {
      const result = this.#database.prepare(`
        UPDATE svml_operations
        SET revision = ?, cancellation_json = ?
        WHERE operation_id = ? AND revision = ?
      `).run(expectedRevision + 1, canonicalStringify(update.cancellation), id, expectedRevision);
      if (result.changes !== 1) {
        const conflict = await this.read(id);
        if (conflict === undefined) throw new Error(`Operation ${id} disappeared during update`);
        return { status: "conflict", current: conflict };
      }
      const stored = await this.read(id);
      if (stored === undefined) throw new Error(`Operation ${id} disappeared after update`);
      return { status: "stored", snapshot: stored };
    }
    const checkpoint = update.status === "pending" ? canonicalStringify({
      format: "svml.operation-pending@1",
      checkpoint: update.checkpoint,
      ...(update.wakeAt === undefined ? {} : { wakeAt: update.wakeAt }),
      ...(update.progress === undefined ? {} : { progress: update.progress }),
    }) : null;
    const completion = update.status === "completed"
      ? canonicalStringify(update.completion)
      : null;
    const failure = update.status === "failed" ? canonicalStringify(update.failure) : null;
    const cancellation = update.status === "cancelled"
      ? canonicalStringify(update.cancellation)
      : current.cancellation === undefined ? null : canonicalStringify(current.cancellation);
    const result = this.#database.prepare(`
      UPDATE svml_operations
      SET revision = ?, status = ?, checkpoint_json = ?, completion_json = ?, failure_json = ?, cancellation_json = ?
      WHERE operation_id = ? AND revision = ? AND status NOT IN ('completed', 'failed', 'cancelled')
    `).run(expectedRevision + 1, update.status, checkpoint, completion, failure, cancellation, id, expectedRevision);
    if (result.changes !== 1) {
      const conflict = await this.read(id);
      if (conflict === undefined) throw new Error(`Operation ${id} disappeared during update`);
      return { status: "conflict", current: conflict };
    }
    const stored = await this.read(id);
    if (stored === undefined) throw new Error(`Operation ${id} disappeared after update`);
    return { status: "stored", snapshot: stored };
  }
}

function dispatchLease(row: Row): DispatchLease | undefined {
  if (row.lease_owner === null || row.lease_owner === undefined) return undefined;
  assert(typeof row.lease_owner === "string", "SQLite Dispatch lease owner is invalid");
  assert(typeof row.lease_token === "string", "SQLite Dispatch lease token is invalid");
  assert(typeof row.lease_fence === "number", "SQLite Dispatch lease fence is invalid");
  assert(typeof row.lease_expires_at === "number", "SQLite Dispatch lease expiry is invalid");
  return {
    owner: row.lease_owner,
    token: row.lease_token,
    fence: row.lease_fence,
    expiresAt: row.lease_expires_at,
  };
}

function parseDispatchSnapshot(row: Row): BuildDispatchSnapshot {
  assert(typeof row.identity_json === "string", "SQLite Dispatch row has no identity");
  assert(typeof row.revision === "number", "SQLite Dispatch row has no revision");
  assert(typeof row.created_at === "number" && typeof row.updated_at === "number", "SQLite Dispatch timestamps are invalid");
  assert(typeof row.priority === "number" && typeof row.available_at === "number", "SQLite Dispatch schedule is invalid");
  assert(typeof row.admission === "string" && typeof row.phase === "string", "SQLite Dispatch state is invalid");
  const identity = JSON.parse(row.identity_json) as BuildDispatchIdentity;
  const lease = dispatchLease(row);
  const snapshot = {
    ...identity,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    priority: row.priority,
    availableAt: row.available_at,
    admission: row.admission,
    phase: row.phase,
    ...(lease === undefined ? {} : { lease }),
    ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
    ...(typeof row.cancel_requested_at === "number"
      ? { cancellation: {
          requestedAt: row.cancel_requested_at,
          ...(typeof row.cancel_reason === "string" ? { reason: row.cancel_reason } : {}),
        } }
      : {}),
    ...(typeof row.terminal === "string" ? { terminal: row.terminal } : {}),
  } as BuildDispatchSnapshot;
  verifyBuildDispatchSnapshot(snapshot);
  return snapshot;
}

function leaseMatches(row: Row, lease: DispatchLease): boolean {
  return row.lease_owner === lease.owner
    && row.lease_token === lease.token
    && row.lease_fence === lease.fence;
}

class SqliteBuildDispatchStore implements BuildDispatchStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async create(
    identity: BuildDispatchIdentity,
    options: { readonly priority?: number; readonly availableAt?: number; readonly now?: number } = {},
  ): Promise<BuildDispatchCreate> {
    verifyBuildDispatchIdentity(identity);
    const now = nonNegativeInteger(options.now ?? Date.now(), "Dispatch creation time");
    const priority = options.priority ?? 0;
    assert(Number.isSafeInteger(priority), "Dispatch priority must be a safe integer");
    const availableAt = nonNegativeInteger(options.availableAt ?? now, "Dispatch availableAt");
    return transaction(this.#database, () => {
      const existingRow = this.#database.prepare(
        "SELECT * FROM svml_dispatches WHERE build_id = ?",
      ).get(identity.build) as Row | undefined;
      if (existingRow !== undefined) {
        const existing = parseDispatchSnapshot(existingRow);
        assert(canonicalStringify({
          format: existing.format,
          id: existing.id,
          build: existing.build,
          core: existing.core,
          runtimeClosure: existing.runtimeClosure,
        }) === canonicalStringify(identity),
        `Dispatch ${identity.build} already names another Build or Runtime Closure`);
        return { status: "existing", snapshot: existing };
      }

      const conflictingRows = this.#database.prepare(`
        SELECT * FROM svml_dispatches
        WHERE phase != 'terminal'
          AND json_extract(identity_json, '$.runtimeClosure') != ?
        ORDER BY created_at ASC, build_id ASC
      `).all(identity.runtimeClosure) as Row[];
      assertRuntimeClosureAdmission(identity.runtimeClosure, conflictingRows.map(parseDispatchSnapshot));

      const result = this.#database.prepare(`
        INSERT INTO svml_dispatches (
          build_id, identity_json, revision, created_at, updated_at, priority, available_at,
          admission, phase, lease_owner, lease_token, lease_fence, lease_expires_at,
          reason, cancel_requested_at, cancel_reason, terminal
        ) VALUES (?, ?, 0, ?, ?, ?, ?, 'open', 'queued', NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL)
      `).run(identity.build, canonicalStringify(identity), now, now, priority, availableAt);
      assert(result.changes === 1, `Dispatch ${identity.build} was not created`);
      const createdRow = this.#database.prepare(
        "SELECT * FROM svml_dispatches WHERE build_id = ?",
      ).get(identity.build) as Row | undefined;
      if (createdRow === undefined) throw new Error(`Dispatch ${identity.build} disappeared after create`);
      return { status: "created", snapshot: parseDispatchSnapshot(createdRow) };
    });
  }

  async read(build: string): Promise<BuildDispatchSnapshot | undefined> {
    const row = this.#database.prepare("SELECT * FROM svml_dispatches WHERE build_id = ?").get(build) as Row | undefined;
    return row === undefined ? undefined : parseDispatchSnapshot(row);
  }

  async list(query: DispatchQuery = {}): Promise<readonly BuildDispatchSnapshot[]> {
    const predicates: string[] = [];
    const values: string[] = [];
    if (query.phases !== undefined) {
      if (query.phases.length === 0) return [];
      predicates.push(`phase IN (${query.phases.map(() => "?").join(", ")})`);
      values.push(...query.phases);
    }
    if (query.admission !== undefined) {
      predicates.push("admission = ?");
      values.push(query.admission);
    }
    const rows = this.#database.prepare(`
      SELECT * FROM svml_dispatches
      ${predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`}
      ORDER BY priority DESC, available_at ASC, created_at ASC, build_id ASC
    `).all(...values) as Row[];
    return rows.map(parseDispatchSnapshot);
  }

  async claim(request: BuildDispatchClaim): Promise<BuildDispatchSnapshot | undefined> {
    assert(request.owner.trim().length > 0 && request.token.trim().length > 0, "Dispatch claim identity is empty");
    assert(/^sha256:[0-9a-f]{64}$/u.test(request.runtimeClosure), "Dispatch claim Runtime Closure is invalid");
    const now = nonNegativeInteger(request.now, "Dispatch claim time");
    const leaseMs = positiveInteger(request.leaseMs, "Dispatch leaseMs");
    return transaction(this.#database, () => {
      const row = this.#database.prepare(`
        SELECT * FROM svml_dispatches
        WHERE phase != 'terminal'
          AND json_extract(identity_json, '$.runtimeClosure') = ?
          AND available_at <= ?
          AND (lease_owner IS NULL OR lease_expires_at <= ?)
        ORDER BY priority DESC, available_at ASC, created_at ASC, build_id ASC
        LIMIT 1
      `).get(request.runtimeClosure, now, now) as Row | undefined;
      if (row === undefined) return undefined;
      assert(typeof row.build_id === "string" && typeof row.revision === "number" && typeof row.lease_fence === "number",
        "SQLite Dispatch claim row is invalid");
      const fence = row.lease_fence + 1;
      const updated = this.#database.prepare(`
        UPDATE svml_dispatches
        SET revision = revision + 1, updated_at = ?, phase = 'leased',
            lease_owner = ?, lease_token = ?, lease_fence = ?, lease_expires_at = ?
        WHERE build_id = ? AND revision = ?
          AND phase != 'terminal' AND (lease_owner IS NULL OR lease_expires_at <= ?)
      `).run(now, request.owner, request.token, fence, now + leaseMs, row.build_id, row.revision, now);
      assert(updated.changes === 1, `Dispatch ${row.build_id} claim lost its transaction`);
      const claimed = this.#database.prepare("SELECT * FROM svml_dispatches WHERE build_id = ?").get(row.build_id) as Row;
      return parseDispatchSnapshot(claimed);
    });
  }

  async heartbeat(build: string, lease: DispatchLease, now: number, leaseMs: number): Promise<BuildDispatchSnapshot> {
    verifyDispatchLease(lease);
    nonNegativeInteger(now, "Dispatch heartbeat time");
    positiveInteger(leaseMs, "Dispatch heartbeat leaseMs");
    const updated = this.#database.prepare(`
      UPDATE svml_dispatches
      SET revision = revision + 1, updated_at = ?, lease_expires_at = ?
      WHERE build_id = ? AND phase = 'leased'
        AND lease_owner = ? AND lease_token = ? AND lease_fence = ? AND lease_expires_at > ?
    `).run(now, now + leaseMs, build, lease.owner, lease.token, lease.fence, now);
    assert(updated.changes === 1, `Dispatch ${build} lease is stale`);
    return (await this.read(build))!;
  }

  async release(
    build: string,
    lease: DispatchLease,
    update: BuildDispatchRelease,
    now = Date.now(),
  ): Promise<BuildDispatchSnapshot> {
    verifyDispatchLease(lease);
    nonNegativeInteger(now, "Dispatch release time");
    nonNegativeInteger(update.availableAt, "Dispatch release availableAt");
    const updated = this.#database.prepare(`
      UPDATE svml_dispatches
      SET revision = revision + 1, updated_at = ?, phase = ?,
          available_at = CASE WHEN wake_at IS NULL THEN ? ELSE MIN(?, wake_at) END,
          wake_at = NULL, reason = ?,
          lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
      WHERE build_id = ? AND phase = 'leased'
        AND lease_owner = ? AND lease_token = ? AND lease_fence = ?
    `).run(now, update.phase, update.availableAt, update.availableAt, update.reason ?? null,
      build, lease.owner, lease.token, lease.fence);
    assert(updated.changes === 1, `Dispatch ${build} lease is stale`);
    return (await this.read(build))!;
  }

  async finish(
    build: string,
    lease: DispatchLease,
    terminal: "complete" | "failed" | "cancelled",
    reason?: string,
    now = Date.now(),
  ): Promise<BuildDispatchSnapshot> {
    verifyDispatchLease(lease);
    const updated = this.#database.prepare(`
      UPDATE svml_dispatches
      SET revision = revision + 1, updated_at = ?, phase = 'terminal', admission = 'closed',
          terminal = ?, reason = ?, wake_at = NULL,
          lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
      WHERE build_id = ? AND phase = 'leased'
        AND lease_owner = ? AND lease_token = ? AND lease_fence = ?
    `).run(now, terminal, reason ?? null, build, lease.owner, lease.token, lease.fence);
    assert(updated.changes === 1, `Dispatch ${build} lease is stale`);
    return (await this.read(build))!;
  }

  async requestCancellation(build: string, reason?: string, now = Date.now()): Promise<BuildDispatchSnapshot> {
    nonNegativeInteger(now, "cancellation request time");
    return transaction(this.#database, () => {
      const row = this.#database.prepare(
        "SELECT * FROM svml_dispatches WHERE build_id = ?",
      ).get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Dispatch ${build} does not exist`);
      const current = parseDispatchSnapshot(row);
      if (current.phase === "terminal") return current;

      // A zero fence proves that no Worker has ever owned this Build. Cancellation is therefore
      // pure queue withdrawal: no Core command, capacity reservation or Provider Operation can
      // exist. Resolve it in this same transaction so a racing claim has exactly one winner.
      if (current.phase === "queued" && row.lease_fence === 0 && row.lease_owner === null) {
        const updated = this.#database.prepare(`
          UPDATE svml_dispatches
          SET revision = revision + 1, updated_at = ?, admission = 'closed', phase = 'terminal',
              terminal = 'cancelled', reason = ?, cancel_requested_at = ?, cancel_reason = ?,
              wake_at = NULL, lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
          WHERE build_id = ? AND phase = 'queued' AND lease_fence = 0 AND lease_owner IS NULL
        `).run(now, reason ?? "cancelled before dispatch", now, reason ?? null, build);
        assert(updated.changes === 1, `Dispatch ${build} cancellation lost its transaction`);
      } else {
        const updated = this.#database.prepare(`
          UPDATE svml_dispatches
          SET revision = revision + 1, updated_at = ?, admission = 'closing',
              cancel_requested_at = COALESCE(cancel_requested_at, ?),
              cancel_reason = COALESCE(cancel_reason, ?),
              available_at = CASE WHEN phase = 'leased' THEN available_at ELSE MIN(available_at, ?) END,
              wake_at = CASE WHEN phase = 'leased' THEN MIN(COALESCE(wake_at, ?), ?) ELSE wake_at END
          WHERE build_id = ? AND phase != 'terminal'
        `).run(now, now, reason ?? null, now, now, now, build);
        assert(updated.changes === 1, `Dispatch ${build} cancellation lost its transaction`);
      }
      const result = this.#database.prepare(
        "SELECT * FROM svml_dispatches WHERE build_id = ?",
      ).get(build) as Row | undefined;
      assert(result !== undefined, `Dispatch ${build} disappeared after cancellation`);
      return parseDispatchSnapshot(result);
    });
  }

  async wake(build: string, now = Date.now()): Promise<BuildDispatchSnapshot> {
    nonNegativeInteger(now, "Dispatch wake time");
    const updated = this.#database.prepare(`
      UPDATE svml_dispatches
      SET revision = revision + 1, updated_at = ?,
          available_at = CASE WHEN phase = 'leased' THEN available_at ELSE MIN(available_at, ?) END,
          wake_at = CASE WHEN phase = 'leased' THEN MIN(COALESCE(wake_at, ?), ?) ELSE wake_at END
      WHERE build_id = ? AND phase != 'terminal'
    `).run(now, now, now, now, build);
    if (updated.changes === 0) {
      const current = await this.read(build);
      if (current === undefined) throw new Error(`Dispatch ${build} does not exist`);
      return current;
    }
    return (await this.read(build))!;
  }

  async acquireCapacity(request: CapacityAcquireRequest): Promise<CapacityAcquire> {
    assert(request.owner.trim().length > 0 && request.token.trim().length > 0, "Capacity claimant is empty");
    assert(request.resources.length > 0, "Capacity resources are empty");
    nonNegativeInteger(request.now, "Capacity acquisition time");
    positiveInteger(request.leaseMs, "Capacity leaseMs");
    verifyCapacityLimits(request.limits);
    verifyDispatchLease(request.buildLease);
    const resources = [...request.resources].map((resource) => ({ ...resource }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const resourceIds = resources.map((resource) => {
      assert(resource.id.trim().length > 0, "Capacity resource id is empty");
      positiveInteger(resource.maxActive, `Capacity resource ${resource.id} maxActive`);
      positiveInteger(resource.maxInFlight, `Capacity resource ${resource.id} maxInFlight`);
      return resource.id;
    });
    assert(new Set(resourceIds).size === resourceIds.length, "Capacity resources contain duplicates");
    if (request.queue !== undefined) {
      assert(request.queue.authority.trim().length > 0 && request.queue.route.trim().length > 0,
        "Capacity queue authority and route are required");
    }
    const resourcesJson = canonicalStringify(resources);
    const queueJson = request.queue === undefined ? null : canonicalStringify(request.queue);
    const id = capacityReservationId(request.build, request.command);
    return transaction(this.#database, () => {
      const dispatch = this.#database.prepare(`
        SELECT lease_owner, lease_token, lease_fence FROM svml_dispatches
        WHERE build_id = ? AND phase = 'leased'
      `).get(request.build) as Row | undefined;
      assert(dispatch !== undefined && leaseMatches(dispatch, request.buildLease),
        `Dispatch ${request.build} lease is stale`);
      let existing = this.#database.prepare("SELECT * FROM svml_capacity WHERE reservation_id = ?").get(id) as Row | undefined;
      if (existing === undefined) {
        this.#database.prepare(`
          INSERT INTO svml_capacity (
            reservation_id, build_id, command_id, resources_json, queue_json, mode, in_flight,
            active_owner, active_token, active_fence, active_expires_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, NULL, ?, ?)
        `).run(id, request.build, request.command, resourcesJson, queueJson, request.mode,
          request.now, request.now);
        existing = this.#database.prepare("SELECT * FROM svml_capacity WHERE reservation_id = ?").get(id) as Row;
      }
      assert(existing.build_id === request.build && existing.command_id === request.command
        && existing.resources_json === resourcesJson && existing.queue_json === queueJson
        && existing.mode === request.mode,
      `Capacity reservation ${id} identity differs`);
      if (existing !== undefined && typeof existing.active_expires_at === "number" && existing.active_expires_at > request.now) {
        return { status: "blocked", retryAt: existing.active_expires_at, reason: "resource-active" };
      }
      const activeGlobal = this.#database.prepare(`
        SELECT COUNT(*) AS count FROM svml_capacity
        WHERE active_owner IS NOT NULL AND active_expires_at > ? AND reservation_id != ?
      `).get(request.now, id) as Row;
      assert(typeof activeGlobal.count === "number", "SQLite global Capacity count is invalid");
      const retryAtRow = this.#database.prepare(`
        SELECT MIN(active_expires_at) AS retry_at FROM svml_capacity
        WHERE active_owner IS NOT NULL AND active_expires_at > ?
      `).get(request.now) as Row;
      const retryAt = typeof retryAtRow.retry_at === "number" ? retryAtRow.retry_at : request.now + 100;
      if (activeGlobal.count >= request.limits.globalActive) return { status: "blocked", retryAt, reason: "global-active" };
      const alreadyInFlight = existing?.in_flight === 1;
      for (const resource of resources) {
        const active = this.#database.prepare(`
          SELECT COUNT(DISTINCT capacity.reservation_id) AS count
          FROM svml_capacity AS capacity, json_each(capacity.resources_json) AS claim
          WHERE json_extract(claim.value, '$.id') = ?
            AND capacity.active_owner IS NOT NULL AND capacity.active_expires_at > ?
            AND capacity.reservation_id != ?
        `).get(resource.id, request.now, id) as Row;
        const inFlight = this.#database.prepare(`
          SELECT COUNT(DISTINCT capacity.reservation_id) AS count
          FROM svml_capacity AS capacity, json_each(capacity.resources_json) AS claim
          WHERE json_extract(claim.value, '$.id') = ?
            AND capacity.in_flight = 1 AND capacity.reservation_id != ?
        `).get(resource.id, id) as Row;
        assert(typeof active.count === "number" && typeof inFlight.count === "number",
          `SQLite Capacity counts for ${resource.id} are invalid`);
        if (active.count >= resource.maxActive) {
          return { status: "blocked", retryAt, reason: "resource-active", resource: resource.id };
        }
        if (request.mode === "recoverable" && !alreadyInFlight && inFlight.count >= resource.maxInFlight) {
          return { status: "blocked", retryAt, reason: "resource-in-flight", resource: resource.id };
        }
      }
      const fence = typeof existing?.active_fence === "number" ? existing.active_fence + 1 : 1;
      this.#database.prepare(`
        UPDATE svml_capacity
        SET in_flight = MAX(in_flight, ?), active_owner = ?, active_token = ?,
            active_fence = ?, active_expires_at = ?, updated_at = ?
        WHERE reservation_id = ?
      `).run(request.mode === "recoverable" ? 1 : 0, request.owner, request.token,
        fence, request.now + request.leaseMs, request.now, id);
      return { status: "acquired", reservation: parseCapacityReservation(
        this.#database.prepare("SELECT * FROM svml_capacity WHERE reservation_id = ?").get(id) as Row,
      ) };
    });
  }

  async heartbeatCapacity(id: Digest, lease: DispatchLease, now: number, leaseMs: number): Promise<CapacityReservation> {
    verifyDispatchLease(lease, "Capacity lease");
    const updated = this.#database.prepare(`
      UPDATE svml_capacity SET active_expires_at = ?, updated_at = ?
      WHERE reservation_id = ? AND active_owner = ? AND active_token = ? AND active_fence = ? AND active_expires_at > ?
    `).run(now + leaseMs, now, id, lease.owner, lease.token, lease.fence, now);
    assert(updated.changes === 1, `Capacity reservation ${id} lease is stale`);
    return parseCapacityReservation(this.#database.prepare("SELECT * FROM svml_capacity WHERE reservation_id = ?").get(id) as Row);
  }

  async parkCapacity(id: Digest, lease: DispatchLease, inFlight: boolean, now = Date.now()): Promise<CapacityReservation> {
    verifyDispatchLease(lease, "Capacity lease");
    const updated = this.#database.prepare(`
      UPDATE svml_capacity
      SET in_flight = ?, active_owner = NULL, active_token = NULL, active_expires_at = NULL, updated_at = ?
      WHERE reservation_id = ? AND active_owner = ? AND active_token = ? AND active_fence = ?
    `).run(inFlight ? 1 : 0, now, id, lease.owner, lease.token, lease.fence);
    assert(updated.changes === 1, `Capacity reservation ${id} lease is stale`);
    return parseCapacityReservation(this.#database.prepare("SELECT * FROM svml_capacity WHERE reservation_id = ?").get(id) as Row);
  }

  async releaseCapacity(id: Digest, lease: DispatchLease): Promise<void> {
    verifyDispatchLease(lease, "Capacity lease");
    const removed = this.#database.prepare(`
      DELETE FROM svml_capacity
      WHERE reservation_id = ? AND active_owner = ? AND active_token = ? AND active_fence = ?
    `).run(id, lease.owner, lease.token, lease.fence);
    assert(removed.changes === 1, `Capacity reservation ${id} lease is stale`);
  }

  async clearCapacity(id: Digest, build: string, buildLease: DispatchLease): Promise<void> {
    verifyDispatchLease(buildLease);
    transaction(this.#database, () => {
      const dispatch = this.#database.prepare(`
        SELECT lease_owner, lease_token, lease_fence FROM svml_dispatches
        WHERE build_id = ? AND phase = 'leased'
      `).get(build) as Row | undefined;
      assert(dispatch !== undefined && leaseMatches(dispatch, buildLease),
        `Dispatch ${build} lease is stale`);
      this.#database.prepare(`
        DELETE FROM svml_capacity WHERE reservation_id = ? AND build_id = ?
      `).run(id, build);
    });
  }

  async listCapacity(): Promise<readonly CapacityReservation[]> {
    return (this.#database.prepare("SELECT * FROM svml_capacity ORDER BY created_at ASC, reservation_id ASC").all() as Row[])
      .map(parseCapacityReservation);
  }
}

function parseCapacityReservation(row: Row): CapacityReservation {
  assert(typeof row.reservation_id === "string" && typeof row.build_id === "string"
    && typeof row.command_id === "string" && typeof row.resources_json === "string" && typeof row.mode === "string",
  "SQLite Capacity row identity is invalid");
  assert(typeof row.in_flight === "number" && typeof row.created_at === "number" && typeof row.updated_at === "number",
    "SQLite Capacity row state is invalid");
  const active = row.active_owner === null || row.active_owner === undefined ? undefined : (() => {
    assert(typeof row.active_owner === "string" && typeof row.active_token === "string"
      && typeof row.active_fence === "number" && typeof row.active_expires_at === "number",
    "SQLite Capacity active lease is invalid");
    return { owner: row.active_owner, token: row.active_token, fence: row.active_fence, expiresAt: row.active_expires_at };
  })();
  const value = {
    format: "svml.capacity-reservation@1" as const,
    id: row.reservation_id as Digest,
    build: row.build_id,
    command: row.command_id,
    resources: JSON.parse(row.resources_json) as CapacityReservation["resources"],
    ...(typeof row.queue_json === "string"
      ? { queue: JSON.parse(row.queue_json) as NonNullable<CapacityReservation["queue"]> }
      : {}),
    mode: row.mode,
    inFlight: row.in_flight === 1,
    ...(active === undefined ? {} : { active }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as CapacityReservation;
  verifyCapacityReservation(value);
  return value;
}

/** One local database with domain-neutral execution facts and Host presentation catalog. */
export class SqliteRuntimeState {
  readonly path: string;
  readonly builds: BuildStore;
  readonly operations: OperationStore;
  readonly dispatch: BuildDispatchStore;
  readonly catalog: BuildCatalog;
  readonly #database: DatabaseSync;

  constructor(path: string, options: SqliteRuntimeStateOptions = {}) {
    assert(path.trim().length > 0, "SQLite path must not be empty");
    const absolute = resolve(path);
    const emptyReadOnly = options.readOnly === true && !existsSync(absolute);
    if (!options.readOnly) mkdirSync(dirname(absolute), { recursive: true });
    const database = emptyReadOnly
      ? new DatabaseSync(":memory:")
      : options.readOnly
        ? new DatabaseSync(absolute, { readOnly: true })
        : new DatabaseSync(absolute);
    this.path = absolute;
    this.#database = database;
    this.#database.exec(`PRAGMA busy_timeout = ${positiveInteger(options.busyTimeoutMs ?? 5_000, "busyTimeoutMs")}`);
    if (!options.readOnly || emptyReadOnly) {
      this.#database.exec("PRAGMA journal_mode = WAL");
      this.#database.exec("PRAGMA synchronous = FULL");
    }
    const alreadyInitialized = this.#database.prepare(`
      SELECT 1 AS present FROM sqlite_master
      WHERE type = 'table' AND name = 'svml_store_meta'
    `).get() as Row | undefined;
    if (alreadyInitialized !== undefined) {
      const version = this.#database.prepare(
        "SELECT schema_version FROM svml_store_meta WHERE singleton = 1",
      ).get() as Row | undefined;
      if (version === undefined || version.schema_version !== databaseSchemaVersion) {
        const found = version === undefined ? "an incomplete schema" : `schema ${String(version.schema_version)}`;
        this.#database.close();
        throw new Error(
          `@narratage/store-sqlite found ${found} at ${absolute}; expected schema ${databaseSchemaVersion}. `
          + "Pre-release Runtime state is not migrated automatically. Archive that database (including its -wal and -shm files) "
          + "or select a new SQLite path in the Runtime Profile; Artifact files are separate and are not deleted.",
        );
      }
    }
    if (!options.readOnly || emptyReadOnly) this.#database.exec(`
      CREATE TABLE IF NOT EXISTS svml_store_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema_version INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS svml_builds (
        build_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        state_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS svml_operations (
        operation_id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'completed', 'failed', 'cancelled')),
        identity_json TEXT NOT NULL,
        checkpoint_json TEXT,
        completion_json TEXT,
        failure_json TEXT,
        cancellation_json TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS svml_build_catalog (
        build_id TEXT PRIMARY KEY,
        core_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        descriptor_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS svml_dispatches (
        build_id TEXT PRIMARY KEY,
        identity_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        priority INTEGER NOT NULL,
        available_at INTEGER NOT NULL,
        wake_at INTEGER,
        admission TEXT NOT NULL CHECK (admission IN ('open', 'closing', 'closed')),
        phase TEXT NOT NULL CHECK (phase IN ('queued', 'leased', 'waiting', 'blocked', 'settling', 'terminal')),
        lease_owner TEXT,
        lease_token TEXT,
        lease_fence INTEGER NOT NULL,
        lease_expires_at INTEGER,
        reason TEXT,
        cancel_requested_at INTEGER,
        cancel_reason TEXT,
        terminal TEXT CHECK (terminal IS NULL OR terminal IN ('complete', 'failed', 'cancelled'))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS svml_dispatch_ready
        ON svml_dispatches (phase, available_at, priority DESC);
      CREATE TABLE IF NOT EXISTS svml_capacity (
        reservation_id TEXT PRIMARY KEY,
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        resources_json TEXT NOT NULL,
        queue_json TEXT,
        mode TEXT NOT NULL CHECK (mode IN ('active', 'recoverable')),
        in_flight INTEGER NOT NULL CHECK (in_flight IN (0, 1)),
        active_owner TEXT,
        active_token TEXT,
        active_fence INTEGER NOT NULL,
        active_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (build_id, command_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS svml_capacity_state ON svml_capacity (in_flight, active_expires_at);
    `);
    if (alreadyInitialized === undefined) {
      this.#database.prepare("INSERT INTO svml_store_meta (singleton, schema_version) VALUES (1, ?)").run(databaseSchemaVersion);
    }
    this.builds = new SqliteBuildStore(database);
    this.operations = new SqliteOperationStore(database);
    this.dispatch = new SqliteBuildDispatchStore(database);
    this.catalog = new SqliteBuildCatalog(database);
  }

  close(): void {
    this.#database.close();
  }
}

export function createSqliteRuntimeComponentPackage(
  options: CreateSqliteRuntimeComponentPackageOptions,
): RuntimeComponentPackage {
  const state = new SqliteRuntimeState(options.path, {
    ...(options.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: options.busyTimeoutMs }),
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
  });
  const buildInstance = options.buildInstance ?? "builds.sqlite";
  const operationInstance = options.operationInstance ?? "operations.sqlite";
  const dispatchInstance = options.dispatchInstance ?? "dispatch.sqlite";
  try {
    return defineRuntimeComponentPackage({
      module: sqliteStoreModuleRef,
      components: [
        {
          role: "build-store",
          facet: "build-store",
          instance: buildInstance,
          implementation: {
            digest: sqliteBuildStoreImplementationDigest,
          },
          configuration: {
            path: state.path,
            schemaVersion: databaseSchemaVersion,
            busyTimeoutMs: options.busyTimeoutMs ?? 5_000,
          },
          port: state.builds,
        },
        {
          role: "operation-store",
          facet: "operation-store",
          instance: operationInstance,
          implementation: {
            digest: sqliteOperationStoreImplementationDigest,
          },
          configuration: {
            path: state.path,
            schemaVersion: databaseSchemaVersion,
            busyTimeoutMs: options.busyTimeoutMs ?? 5_000,
          },
          port: state.operations,
        },
        {
          role: "dispatch-store",
          facet: "dispatch-store",
          instance: dispatchInstance,
          implementation: {
            digest: sqliteDispatchStoreImplementationDigest,
          },
          configuration: {
            path: state.path,
            schemaVersion: databaseSchemaVersion,
            busyTimeoutMs: options.busyTimeoutMs ?? 5_000,
          },
          port: state.dispatch,
        },
      ],
      buildCatalog: state.catalog,
      close: () => state.close(),
    });
  } catch (error) {
    state.close();
    throw error;
  }
}
