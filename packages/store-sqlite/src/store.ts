import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { materializeBuild } from "@narratage/core";
import type {
  BuildDefinition,
  BuildFact,
} from "@narratage/protocol";
import type {
  BuildDispatchRequest,
  BuildDispatchRelease,
  BuildDispatchSnapshot,
  BuildDispatchStore,
  BuildCatalog,
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildSnapshot,
  BuildStore,
  CapacityAcquire,
  CapacityAcquireRequest,
  CapacityReservation,
  DispatchQuery,
  OperationIdentity,
  OperationQuery,
  OperationSnapshot,
  OperationStore,
  OperationUpdate,
} from "@narratage/runtime";

export type SqliteRuntimeStateOptions = {
  readonly busyTimeoutMs?: number;
  /** Open an existing archive without creating files or schema. */
  readonly readOnly?: boolean;
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

function parseBuildSnapshot(row: Row, factRows: readonly Row[]): BuildSnapshot {
  assert(typeof row.build_id === "string", "SQLite Build row has no build id");
  assert(typeof row.definition_json === "string", "SQLite Build row has no Definition");
  const definition = JSON.parse(row.definition_json) as BuildDefinition;
  const facts = factRows.map((factRow) => {
    assert(typeof factRow.fact_json === "string", "SQLite Build Fact row has no Fact");
    return JSON.parse(factRow.fact_json) as BuildFact;
  });
  const state = materializeBuild(definition, facts);
  return { build: row.build_id, definition, facts, state };
}

function operationIdentityFrom(snapshot: OperationSnapshot): OperationIdentity {
  return {
    id: snapshot.id,
    build: snapshot.build,
    command: snapshot.command,
    endpoint: snapshot.endpoint,
    pool: snapshot.pool,
    lane: snapshot.lane,
  };
}

function parseOperationSnapshot(row: Row): OperationSnapshot {
  for (const field of ["operation_id", "build_id", "command_id", "endpoint_id", "pool_id", "lane_id"] as const) {
    assert(typeof row[field] === "string", `SQLite Operation row has no ${field}`);
  }
  assert(typeof row.status === "string", "SQLite Operation row has no status");
  const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) as unknown : undefined;
  const pending = row.status === "pending" ? payload as {
        readonly handle: unknown;
        readonly wakeAt?: number;
        readonly progress?: OperationSnapshot["progress"];
      } : undefined;
  const mutable = row.status === "pending"
    ? {
        handle: pending!.handle,
        ...(pending!.wakeAt === undefined ? {} : { wakeAt: pending!.wakeAt }),
        ...(pending!.progress === undefined ? {} : { progress: pending!.progress }),
      }
    : row.status === "completed"
      ? { completion: payload }
      : row.status === "failed"
        ? { failure: payload }
        : {};
  return {
    id: row.operation_id,
    build: row.build_id,
    command: row.command_id,
    endpoint: row.endpoint_id,
    pool: row.pool_id,
    lane: row.lane_id,
    status: row.status,
    ...mutable,
  } as OperationSnapshot;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

class SqliteBuildStore implements BuildStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  #facts(build: string): Row[] {
    return this.#database.prepare(`
      SELECT fact_json
      FROM narratage_build_facts
      WHERE build_id = ?
      ORDER BY sequence ASC
    `).all(build) as Row[];
  }

  async create(build: string, definition: BuildDefinition): Promise<BuildSnapshot> {
    assert(build.trim().length > 0, "build id must not be empty");
    const result = this.#database.prepare(`
      INSERT OR IGNORE INTO narratage_builds (build_id, definition_json)
      VALUES (?, ?)
    `).run(build, JSON.stringify(definition));
    if (result.changes !== 1) throw new Error(`build ${build} already exists`);
    const storedDefinition = copy(definition);
    const facts: readonly BuildFact[] = [];
    const state = materializeBuild(storedDefinition, facts);
    return { build, definition: storedDefinition, facts, state };
  }

  async read(build: string): Promise<BuildSnapshot | undefined> {
    const row = this.#database.prepare(`
      SELECT build_id, definition_json
      FROM narratage_builds
      WHERE build_id = ?
    `).get(build) as Row | undefined;
    return row === undefined ? undefined : parseBuildSnapshot(row, this.#facts(build));
  }

  async append(build: string, fact: BuildFact): Promise<void> {
    const result = this.#database.prepare(`
      INSERT INTO narratage_build_facts (
        build_id, command_id, fact_json
      ) VALUES (?, ?, ?)
    `).run(build, fact.command, JSON.stringify(fact));
    if (result.changes !== 1) throw new Error(`Build ${build} Fact was not stored`);
  }
}

function parseCatalogEntry(row: Row): BuildCatalogEntry {
  assert(typeof row.build_id === "string", "SQLite Build Catalog row has no build id");
  assert(typeof row.created_at === "number", "SQLite Build Catalog row has no creation time");
  assert(typeof row.descriptor_json === "string", "SQLite Build Catalog row has no descriptor");
  const descriptor = JSON.parse(row.descriptor_json) as BuildCatalogDescriptor;
  return {
    ...descriptor,
    build: row.build_id,
    createdAt: row.created_at,
  };
}

class SqliteBuildCatalog implements BuildCatalog {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async record(build: string, descriptor: BuildCatalogDescriptor): Promise<BuildCatalogEntry> {
    assert(build.trim().length > 0, "Build Catalog build id must not be empty");
    const now = Date.now();
    this.#database.prepare(`
      INSERT INTO narratage_build_catalog (
        build_id, created_at, descriptor_json
      ) VALUES (?, ?, ?)
    `).run(build, now, JSON.stringify(descriptor));
    return { ...copy(descriptor), build, createdAt: now };
  }

  async read(build: string): Promise<BuildCatalogEntry | undefined> {
    const row = this.#database.prepare(`
      SELECT build_id, created_at, descriptor_json
      FROM narratage_build_catalog
      WHERE build_id = ?
    `).get(build) as Row | undefined;
    return row === undefined ? undefined : parseCatalogEntry(row);
  }

  async list(): Promise<readonly BuildCatalogEntry[]> {
    const rows = this.#database.prepare(`
      SELECT build_id, created_at, descriptor_json
      FROM narratage_build_catalog
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

  async create(operation: OperationSnapshot): Promise<OperationSnapshot> {
    const identity = operationIdentityFrom(operation);
    const payload = operation.status === "pending"
      ? JSON.stringify({
          handle: operation.handle,
          ...(operation.wakeAt === undefined ? {} : { wakeAt: operation.wakeAt }),
          ...(operation.progress === undefined ? {} : { progress: operation.progress }),
        })
      : operation.status === "completed"
        ? JSON.stringify(operation.completion)
        : operation.status === "failed" ? JSON.stringify(operation.failure) : null;
    const result = this.#database.prepare(`
      INSERT INTO narratage_operations (
        operation_id, build_id, command_id, endpoint_id, pool_id, lane_id, status,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(identity.id, identity.build, identity.command, identity.endpoint, identity.pool, identity.lane,
      operation.status, payload);
    if (result.changes !== 1) throw new Error(`Operation ${identity.id} was not created`);
    return copy(operation);
  }

  async read(id: string): Promise<OperationSnapshot | undefined> {
    const row = this.#database.prepare(`
      SELECT operation_id, build_id, command_id, endpoint_id, pool_id, lane_id,
        status, payload_json
      FROM narratage_operations
      WHERE operation_id = ?
    `).get(id) as Row | undefined;
    return row === undefined ? undefined : parseOperationSnapshot(row);
  }

  async list(query: OperationQuery): Promise<readonly OperationSnapshot[]> {
    const predicates: string[] = [];
    const values: string[] = [];
    for (const [field, value] of [
      ["build_id", query.build],
      ["command_id", query.command],
      ["endpoint_id", query.endpoint],
    ] as const) {
      if (value === undefined) continue;
      predicates.push(`${field} = ?`);
      values.push(value);
    }
    const rows = this.#database.prepare(`
      SELECT operation_id, build_id, command_id, endpoint_id, pool_id, lane_id,
        status, payload_json
      FROM narratage_operations
      ${predicates.length === 0 ? "" : `WHERE ${predicates.join(" AND ")}`}
      ORDER BY operation_id ASC
    `).all(...values) as Row[];
    return rows.map(parseOperationSnapshot)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async update(id: string, update: OperationUpdate): Promise<OperationSnapshot> {
    const current = await this.read(id);
    if (current === undefined) throw new Error(`Operation ${id} does not exist`);
    if (current.status === "completed" || current.status === "failed" || current.status === "cancelled") return current;
    const payload = update.status === "pending"
      ? JSON.stringify({
          handle: update.handle,
          ...(update.wakeAt === undefined ? {} : { wakeAt: update.wakeAt }),
          ...(update.progress === undefined ? {} : { progress: update.progress }),
        })
      : update.status === "completed"
        ? JSON.stringify(update.completion)
        : update.status === "failed" ? JSON.stringify(update.failure) : null;
    const result = this.#database.prepare(`
      UPDATE narratage_operations
      SET status = ?, payload_json = ?
      WHERE operation_id = ?
    `).run(update.status, payload, id);
    if (result.changes !== 1) throw new Error(`Operation ${id} disappeared during update`);
    const mutable = update.status === "pending"
      ? {
          status: "pending" as const,
          handle: copy(update.handle),
          ...(update.wakeAt === undefined ? {} : { wakeAt: update.wakeAt }),
          ...(update.progress === undefined ? {} : { progress: copy(update.progress) }),
        }
      : update.status === "completed"
        ? { status: "completed" as const, completion: copy(update.completion) }
        : update.status === "failed"
          ? { status: "failed" as const, failure: copy(update.failure) }
          : { status: "cancelled" as const };
    return { ...operationIdentityFrom(current), ...mutable };
  }
}


function parseDispatchSnapshot(row: Row): BuildDispatchSnapshot {
  assert(typeof row.build_id === "string", "SQLite Dispatch row has no Build id");
  assert(typeof row.component_packages_json === "string", "SQLite Dispatch row has no component packages");
  assert(typeof row.created_at === "number", "SQLite Dispatch time is invalid");
  assert(typeof row.available_at === "number", "SQLite Dispatch schedule is invalid");
  assert(typeof row.phase === "string", "SQLite Dispatch state is invalid");
  const componentPackages = JSON.parse(row.component_packages_json) as readonly string[];
  const cancellation = row.cancel_requested === 1
    ? {
        cancellation: {
          ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
        },
      }
    : {};
  const snapshot = {
    build: row.build_id,
    componentPackages,
    createdAt: row.created_at,
    availableAt: row.available_at,
    phase: row.phase,
    ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
    ...cancellation,
    ...(typeof row.terminal === "string" ? { terminal: row.terminal } : {}),
  } as BuildDispatchSnapshot;
  return snapshot;
}

class SqliteBuildDispatchStore implements BuildDispatchStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async create(
    request: BuildDispatchRequest,
    options: { readonly now?: number } = {},
  ): Promise<BuildDispatchSnapshot> {
    const now = options.now ?? Date.now();
    nonNegativeInteger(now, "Dispatch creation time");
    this.#database.prepare(`
      INSERT INTO narratage_dispatches (
        build_id, component_packages_json, created_at, available_at,
        phase, reason, cancel_requested, terminal
      ) VALUES (?, ?, ?, ?, 'queued', NULL, 0, NULL)
    `).run(request.build, JSON.stringify(request.componentPackages), now, now);
    return {
      ...copy(request),
      createdAt: now,
      availableAt: now,
      phase: "queued",
    };
  }

  async read(build: string): Promise<BuildDispatchSnapshot | undefined> {
    const row = this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(build) as Row | undefined;
    return row === undefined ? undefined : parseDispatchSnapshot(row);
  }

  async list(query: DispatchQuery = {}): Promise<readonly BuildDispatchSnapshot[]> {
    const rows = this.#database.prepare(`
      SELECT * FROM narratage_dispatches
      ORDER BY created_at ASC, build_id ASC
    `).all() as Row[];
    return rows.map(parseDispatchSnapshot)
      .filter((item) => query.phases === undefined || query.phases.includes(item.phase));
  }

  async claim(now = Date.now()): Promise<BuildDispatchSnapshot | undefined> {
    nonNegativeInteger(now, "Dispatch claim time");
    return transaction(this.#database, () => {
      const row = this.#database.prepare(`
        SELECT build_id FROM narratage_dispatches
        WHERE phase IN ('queued', 'waiting') AND available_at <= ?
        ORDER BY available_at ASC, created_at ASC, build_id ASC
        LIMIT 1
      `).get(now) as Row | undefined;
      if (row === undefined) return undefined;
      assert(typeof row.build_id === "string", "SQLite ready Dispatch has no Build id");
      const updated = this.#database.prepare(`
        UPDATE narratage_dispatches
        SET phase = 'running'
        WHERE build_id = ? AND phase IN ('queued', 'waiting') AND available_at <= ?
      `).run(row.build_id, now);
      if (updated.changes !== 1) return undefined;
      return parseDispatchSnapshot(
        this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(row.build_id) as Row,
      );
    });
  }

  async release(build: string, update: BuildDispatchRelease): Promise<BuildDispatchSnapshot> {
    nonNegativeInteger(update.availableAt, "Dispatch release availableAt");
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Dispatch ${build} does not exist`);
      const current = parseDispatchSnapshot(row);
      if (current.phase === "terminal") return current;
      if (current.cancellation !== undefined) return current;
      assert(current.phase === "running", `Dispatch ${build} is not running`);
      this.#database.prepare(`
        UPDATE narratage_dispatches
        SET phase = ?, available_at = ?, reason = ?
        WHERE build_id = ?
      `).run(update.phase, update.availableAt, update.reason ?? null, build);
      return parseDispatchSnapshot(
        this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async finish(
    build: string,
    terminal: "complete" | "failed" | "cancelled",
    reason?: string,
  ): Promise<BuildDispatchSnapshot> {
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Dispatch ${build} does not exist`);
      const current = parseDispatchSnapshot(row);
      if (current.phase === "terminal") return current;
      const effective = current.cancellation === undefined ? terminal : "cancelled";
      this.#database.prepare(`
        UPDATE narratage_dispatches
        SET phase = 'terminal', terminal = ?, reason = ?
        WHERE build_id = ?
      `).run(effective, reason ?? current.cancellation?.reason ?? null, build);
      return parseDispatchSnapshot(
        this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async requestCancellation(build: string, reason?: string): Promise<BuildDispatchSnapshot> {
    const now = Date.now();
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Dispatch ${build} does not exist`);
      const current = parseDispatchSnapshot(row);
      if (current.phase === "terminal") return current;
      if (current.cancellation !== undefined) return current;
      if (current.phase === "queued") {
        this.#database.prepare(`
          UPDATE narratage_dispatches
          SET phase = 'terminal', terminal = 'cancelled',
              reason = ?, cancel_requested = 1
          WHERE build_id = ?
        `).run(reason ?? "cancelled before execution", build);
      } else {
        this.#database.prepare(`
          UPDATE narratage_dispatches
          SET phase = CASE WHEN phase = 'running' THEN phase ELSE 'queued' END,
              available_at = CASE WHEN phase = 'running' THEN available_at ELSE ? END,
              reason = ?, cancel_requested = 1
          WHERE build_id = ?
        `).run(now, reason ?? "cancellation requested", build);
      }
      return parseDispatchSnapshot(
        this.#database.prepare("SELECT * FROM narratage_dispatches WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async acquireCapacity(request: CapacityAcquireRequest): Promise<CapacityAcquire> {
    nonNegativeInteger(request.now, "Capacity acquisition time");
    assert(request.resources.length > 0, "Capacity resources are empty");
    const resources = [...request.resources].sort((left, right) => left.id.localeCompare(right.id));
    const reservation: CapacityReservation = {
      build: request.build,
      command: request.command,
      resources,
      ...(request.queue === undefined ? {} : { queue: request.queue }),
      createdAt: request.now,
    };
    return transaction(this.#database, () => {
      const existing = this.#database.prepare(
        "SELECT * FROM narratage_capacity WHERE build_id = ? AND command_id = ?",
      ).get(reservation.build, reservation.command) as Row | undefined;
      if (existing !== undefined) {
        return { status: "acquired", reservation: parseCapacityReservation(existing) };
      }
      for (const resource of resources) {
        const count = this.#database.prepare(`
          SELECT COUNT(DISTINCT capacity.rowid) AS count
          FROM narratage_capacity AS capacity, json_each(capacity.resources_json) AS claim
          WHERE json_extract(claim.value, '$.id') = ?
        `).get(resource.id) as Row;
        assert(typeof count.count === "number", `SQLite Capacity count for ${resource.id} is invalid`);
        if (count.count >= resource.maxInFlight) {
          return {
            status: "blocked",
            availableAt: request.now + 250,
            reason: "resource-in-flight",
            resource: resource.id,
          };
        }
      }
      this.#database.prepare(`
        INSERT INTO narratage_capacity (
          build_id, command_id, resources_json, queue_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        reservation.build,
        reservation.command,
        JSON.stringify(reservation.resources),
        reservation.queue === undefined ? null : JSON.stringify(reservation.queue),
        reservation.createdAt,
      );
      return { status: "acquired", reservation };
    });
  }

  async releaseCapacity(build: string, command: string): Promise<void> {
    this.#database.prepare(
      "DELETE FROM narratage_capacity WHERE build_id = ? AND command_id = ?",
    ).run(build, command);
  }

  async releaseBuildCapacity(build: string): Promise<void> {
    this.#database.prepare("DELETE FROM narratage_capacity WHERE build_id = ?").run(build);
  }

  async listCapacity(): Promise<readonly CapacityReservation[]> {
    return (this.#database.prepare(
      "SELECT * FROM narratage_capacity ORDER BY created_at ASC, build_id ASC, command_id ASC",
    ).all() as Row[]).map(parseCapacityReservation);
  }
}

function parseCapacityReservation(row: Row): CapacityReservation {
  assert(typeof row.build_id === "string" && typeof row.command_id === "string"
    && typeof row.resources_json === "string"
    && typeof row.created_at === "number", "SQLite Capacity row is invalid");
  const value = {
    build: row.build_id,
    command: row.command_id,
    resources: JSON.parse(row.resources_json) as CapacityReservation["resources"],
    ...(typeof row.queue_json === "string"
      ? { queue: JSON.parse(row.queue_json) as NonNullable<CapacityReservation["queue"]> }
      : {}),
    createdAt: row.created_at,
  };
  return value;
}

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
      this.#database.exec("PRAGMA synchronous = NORMAL");
    }
    if (!options.readOnly || emptyReadOnly) this.#database.exec(`
      CREATE TABLE IF NOT EXISTS narratage_builds (
        build_id TEXT PRIMARY KEY,
        definition_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS narratage_build_facts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        fact_json TEXT NOT NULL,
        UNIQUE (build_id, command_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS narratage_operations (
        operation_id TEXT PRIMARY KEY,
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        endpoint_id TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
        payload_json TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS narratage_build_catalog (
        build_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        descriptor_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS narratage_dispatches (
        build_id TEXT PRIMARY KEY,
        component_packages_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        available_at INTEGER NOT NULL,
        phase TEXT NOT NULL CHECK (phase IN ('queued', 'running', 'waiting', 'terminal')),
        reason TEXT,
        cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
        terminal TEXT CHECK (terminal IS NULL OR terminal IN ('complete', 'failed', 'cancelled'))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS narratage_dispatch_ready
        ON narratage_dispatches (phase, available_at);
      CREATE TABLE IF NOT EXISTS narratage_capacity (
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        resources_json TEXT NOT NULL,
        queue_json TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (build_id, command_id)
      ) STRICT;
    `);
    this.builds = new SqliteBuildStore(database);
    this.operations = new SqliteOperationStore(database);
    this.dispatch = new SqliteBuildDispatchStore(database);
    this.catalog = new SqliteBuildCatalog(database);
  }

  close(): void {
    this.#database.close();
  }
}
