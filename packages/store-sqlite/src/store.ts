import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { materializeBuild } from "@hypit/core";
import type {
  BuildDefinition,
  BuildFact,
  CommandResult,
} from "@hypit/protocol";
import { assertBuildId } from "@hypit/protocol";
import type {
  PendingBuildCommit,
  PendingBuildSubmission,
  PendingBuildStore,
  BuildExecutionRequest,
  BuildExecutionSnapshot,
  BuildExecutionStore,
  BuildCatalog,
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildSnapshot,
  BuildStore,
  CapacityAcquire,
  CapacityAcquireRequest,
  CapacityReservation,
  CommandExecutionBegin,
  CommandExecutionReceipt,
  CommandExecutionStore,
  OperationIdentity,
  OperationQuery,
  OperationSnapshot,
  OperationStore,
  OperationUpdate,
  RuntimeWorkerLease,
  RuntimeWorkerLeaseStore,
  RuntimeEnvironmentStore,
} from "@hypit/runtime";

export type SqliteRuntimeStateOptions = {
  readonly busyTimeoutMs?: number;
  /** Open an existing Runtime database without creating files or schema. */
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
      FROM hypit_build_facts
      WHERE build_id = ?
      ORDER BY sequence ASC
    `).all(build) as Row[];
  }

  async create(build: string, definition: BuildDefinition): Promise<BuildSnapshot> {
    assertBuildId(build);
    const result = this.#database.prepare(`
      INSERT OR IGNORE INTO hypit_builds (build_id, definition_json)
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
      FROM hypit_builds
      WHERE build_id = ?
    `).get(build) as Row | undefined;
    return row === undefined ? undefined : parseBuildSnapshot(row, this.#facts(build));
  }

  async append(build: string, fact: BuildFact): Promise<void> {
    const result = this.#database.prepare(`
      INSERT INTO hypit_build_facts (
        build_id, command_id, fact_json
      ) VALUES (?, ?, ?)
    `).run(build, fact.command, JSON.stringify(fact));
    if (result.changes !== 1) throw new Error(`Build ${build} Fact was not stored`);
  }

  async remove(build: string): Promise<void> {
    transaction(this.#database, () => {
      this.#database.prepare("DELETE FROM hypit_build_facts WHERE build_id = ?").run(build);
      this.#database.prepare("DELETE FROM hypit_builds WHERE build_id = ?").run(build);
    });
  }
}

function parseCatalogEntry(row: Row): BuildCatalogEntry {
  assert(typeof row.build_id === "string", "SQLite Build Catalog row has no build id");
  assert(typeof row.descriptor_json === "string", "SQLite Build Catalog row has no descriptor");
  const descriptor = JSON.parse(row.descriptor_json) as BuildCatalogDescriptor;
  return {
    ...descriptor,
    build: row.build_id,
  };
}

class SqliteBuildCatalog implements BuildCatalog {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async record(build: string, descriptor: BuildCatalogDescriptor): Promise<BuildCatalogEntry> {
    assertBuildId(build);
    const now = Date.now();
    this.#database.prepare(`
      INSERT INTO hypit_build_catalog (
        build_id, created_at, descriptor_json
      ) VALUES (?, ?, ?)
    `).run(build, now, JSON.stringify(descriptor));
    return { ...copy(descriptor), build };
  }

  async read(build: string): Promise<BuildCatalogEntry | undefined> {
    const row = this.#database.prepare(`
      SELECT build_id, created_at, descriptor_json
      FROM hypit_build_catalog
      WHERE build_id = ?
    `).get(build) as Row | undefined;
    return row === undefined ? undefined : parseCatalogEntry(row);
  }

  async remove(build: string): Promise<void> {
    this.#database.prepare("DELETE FROM hypit_build_catalog WHERE build_id = ?").run(build);
  }
}

function parseExecutionRequest(row: Row, subject: string): BuildExecutionRequest {
  assert(typeof row.build_id === "string", `SQLite ${subject} row has no Build id`);
  assert(typeof row.component_packages_json === "string", `SQLite ${subject} row has no component packages`);
  assert(typeof row.result_location_json === "string", `SQLite ${subject} row has no Result location`);
  const componentPackages = JSON.parse(row.component_packages_json) as unknown;
  assert(Array.isArray(componentPackages) && componentPackages.every((item) => typeof item === "string"),
    `SQLite ${subject} component packages are invalid`);
  const result = JSON.parse(row.result_location_json) as Partial<BuildExecutionRequest["result"]>;
  assert(typeof result.root === "string" && typeof result.selection?.use === "string",
    `SQLite ${subject} Result location is invalid`);
  return {
    build: row.build_id,
    componentPackages,
    result: result as BuildExecutionRequest["result"],
  };
}

function parsePendingBuildSubmission(row: Row): PendingBuildSubmission {
  assert(typeof row.created_at === "number", "SQLite pending-submission creation time is invalid");
  return { ...parseExecutionRequest(row, "pending submission"), createdAt: row.created_at };
}

class SqlitePendingBuildStore implements PendingBuildStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async prepare(
    request: BuildExecutionRequest,
    options: { readonly now?: number } = {},
  ): Promise<PendingBuildSubmission> {
    assertBuildId(request.build);
    const now = options.now ?? Date.now();
    nonNegativeInteger(now, "Build submission preparation time");
    return transaction(this.#database, () => {
      const occupied = this.#database.prepare(`
        SELECT 1 AS occupied FROM hypit_submissions WHERE build_id = ?
        UNION ALL SELECT 1 FROM hypit_executions WHERE build_id = ?
        UNION ALL SELECT 1 FROM hypit_builds WHERE build_id = ?
        UNION ALL SELECT 1 FROM hypit_build_catalog WHERE build_id = ?
        UNION ALL SELECT 1 FROM hypit_operations WHERE build_id = ?
        UNION ALL SELECT 1 FROM hypit_command_executions WHERE build_id = ?
        UNION ALL SELECT 1 FROM hypit_build_facts WHERE build_id = ?
        UNION ALL SELECT 1 FROM hypit_capacity WHERE build_id = ?
        LIMIT 1
      `).get(request.build, request.build, request.build, request.build, request.build, request.build, request.build, request.build);
      assert(occupied === undefined, `Build ${request.build} already has Runtime state`);
      this.#database.prepare(`
        INSERT INTO hypit_submissions (
          build_id, component_packages_json, result_location_json, created_at
        ) VALUES (?, ?, ?, ?)
      `).run(
        request.build,
        JSON.stringify(request.componentPackages),
        JSON.stringify(request.result),
        now,
      );
      return parsePendingBuildSubmission(
        this.#database.prepare("SELECT * FROM hypit_submissions WHERE build_id = ?").get(request.build) as Row,
      );
    });
  }

  async read(build: string): Promise<PendingBuildSubmission | undefined> {
    const row = this.#database.prepare("SELECT * FROM hypit_submissions WHERE build_id = ?").get(build) as Row | undefined;
    return row === undefined ? undefined : parsePendingBuildSubmission(row);
  }

  async list(): Promise<readonly PendingBuildSubmission[]> {
    return (this.#database.prepare(
      "SELECT * FROM hypit_submissions ORDER BY created_at ASC, build_id ASC",
    ).all() as Row[]).map(parsePendingBuildSubmission);
  }

  async commit(request: PendingBuildCommit): Promise<BuildExecutionSnapshot> {
    assertBuildId(request.build);
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_submissions WHERE build_id = ?").get(request.build) as Row | undefined;
      if (row === undefined) throw new Error(`Build submission ${request.build} was not prepared`);
      const submission = parsePendingBuildSubmission(row);
      assert(JSON.stringify(submission.componentPackages) === JSON.stringify(request.componentPackages)
        && JSON.stringify(submission.result) === JSON.stringify(request.result),
      `Build submission ${request.build} does not match its prepared state`);
      this.#database.prepare(`
        INSERT INTO hypit_builds (build_id, definition_json) VALUES (?, ?)
      `).run(request.build, JSON.stringify(request.definition));
      this.#database.prepare(`
        INSERT INTO hypit_build_catalog (build_id, created_at, descriptor_json) VALUES (?, ?, ?)
      `).run(request.build, Date.now(), JSON.stringify(request.catalog));
      this.#database.prepare(`
        INSERT INTO hypit_executions (
          build_id, component_packages_json, result_location_json, created_at, wake_at,
          turn_owner, turn_acquired_at, result_writer_owner, result_writer_acquired_at,
          cancel_requested, cancellation_reason,
          decision_outcome, decision_reason, attention_step, attention_error
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL)
      `).run(
        request.build,
        JSON.stringify(request.componentPackages),
        JSON.stringify(request.result),
        submission.createdAt,
        Date.now(),
      );
      this.#database.prepare("DELETE FROM hypit_submissions WHERE build_id = ?").run(request.build);
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(request.build) as Row,
      );
    });
  }

  async discard(build: string): Promise<void> {
    assertBuildId(build);
    transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT build_id FROM hypit_submissions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) return;
      this.#database.prepare("DELETE FROM hypit_submissions WHERE build_id = ?").run(build);
    });
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
      INSERT INTO hypit_operations (
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
      FROM hypit_operations
      WHERE operation_id = ?
    `).get(id) as Row | undefined;
    return row === undefined ? undefined : parseOperationSnapshot(row);
  }

  async removeBuild(build: string): Promise<void> {
    this.#database.prepare("DELETE FROM hypit_operations WHERE build_id = ?").run(build);
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
      FROM hypit_operations
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
      UPDATE hypit_operations
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

function parseCommandExecution(row: Row): CommandExecutionReceipt {
  assert(typeof row.build_id === "string" && typeof row.command_id === "string",
    "SQLite Command execution has no identity");
  assert(row.status === "started" || row.status === "completed",
    "SQLite Command execution has an invalid status");
  const event = typeof row.event_json === "string"
    ? JSON.parse(row.event_json) as CommandResult
    : undefined;
  if (row.status === "completed") {
    assert(event !== undefined, `SQLite Command execution ${row.command_id} has no result`);
  }
  return {
    build: row.build_id,
    command: row.command_id,
    status: row.status,
    ...(event === undefined ? {} : { event }),
  };
}

class SqliteCommandExecutionStore implements CommandExecutionStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async begin(build: string, command: string): Promise<CommandExecutionBegin> {
    return transaction(this.#database, () => {
      const inserted = this.#database.prepare(`
        INSERT OR IGNORE INTO hypit_command_executions (build_id, command_id, status, event_json)
        VALUES (?, ?, 'started', NULL)
      `).run(build, command);
      const row = this.#database.prepare(`
        SELECT * FROM hypit_command_executions WHERE build_id = ? AND command_id = ?
      `).get(build, command) as Row;
      return { created: inserted.changes === 1, receipt: parseCommandExecution(row) };
    });
  }

  async complete(build: string, command: string, event: CommandResult): Promise<CommandExecutionReceipt> {
    return transaction(this.#database, () => {
      const row = this.#database.prepare(`
        SELECT * FROM hypit_command_executions WHERE build_id = ? AND command_id = ?
      `).get(build, command) as Row | undefined;
      if (row === undefined) throw new Error(`Command execution ${build}/${command} was not started`);
      const current = parseCommandExecution(row);
      if (current.status === "completed") return current;
      this.#database.prepare(`
        UPDATE hypit_command_executions SET status = 'completed', event_json = ?
        WHERE build_id = ? AND command_id = ? AND status = 'started'
      `).run(JSON.stringify(event), build, command);
      return parseCommandExecution(this.#database.prepare(`
        SELECT * FROM hypit_command_executions WHERE build_id = ? AND command_id = ?
      `).get(build, command) as Row);
    });
  }

  async list(build: string): Promise<readonly CommandExecutionReceipt[]> {
    return (this.#database.prepare(`
      SELECT * FROM hypit_command_executions WHERE build_id = ? ORDER BY command_id ASC
    `).all(build) as Row[]).map(parseCommandExecution);
  }

  async removeBuild(build: string): Promise<void> {
    this.#database.prepare("DELETE FROM hypit_command_executions WHERE build_id = ?").run(build);
  }
}

class SqliteRuntimeWorkerLeaseStore implements RuntimeWorkerLeaseStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async read(): Promise<RuntimeWorkerLease | undefined> {
    const row = this.#database.prepare("SELECT * FROM hypit_worker_lease WHERE singleton = 1").get() as Row | undefined;
    if (row === undefined) return undefined;
    assert(typeof row.owner_id === "string" && typeof row.pid === "number"
      && typeof row.acquired_at === "number" && typeof row.expires_at === "number",
    "SQLite Runtime Worker lease is invalid");
    return {
      owner: row.owner_id,
      pid: row.pid,
      acquiredAt: row.acquired_at,
      expiresAt: row.expires_at,
    };
  }

  async acquire(request: RuntimeWorkerLease): Promise<boolean> {
    positiveInteger(request.pid, "Runtime Worker pid");
    nonNegativeInteger(request.acquiredAt, "Runtime Worker acquisition time");
    assert(request.owner.trim().length > 0, "Runtime Worker owner is empty");
    assert(Number.isSafeInteger(request.expiresAt) && request.expiresAt > request.acquiredAt,
      "Runtime Worker lease expiration is invalid");
    return transaction(this.#database, () => {
      const row = this.#database.prepare(
        "SELECT owner_id, pid, expires_at FROM hypit_worker_lease WHERE singleton = 1",
      ).get() as Row | undefined;
      if (row !== undefined) {
        assert(typeof row.owner_id === "string" && typeof row.pid === "number"
          && typeof row.expires_at === "number", "SQLite Runtime Worker lease is invalid");
        if (row.owner_id === request.owner && row.pid === request.pid) return true;
        if (row.expires_at > request.acquiredAt) return false;
      }
      this.#database.prepare(`
        INSERT INTO hypit_worker_lease (singleton, owner_id, pid, acquired_at, expires_at)
        VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET
          owner_id = excluded.owner_id,
          pid = excluded.pid,
          acquired_at = excluded.acquired_at,
          expires_at = excluded.expires_at
      `).run(request.owner, request.pid, request.acquiredAt, request.expiresAt);
      return true;
    });
  }

  async renew(owner: string, pid: number, expiresAt: number): Promise<boolean> {
    const result = this.#database.prepare(`
      UPDATE hypit_worker_lease SET expires_at = ?
      WHERE singleton = 1 AND owner_id = ? AND pid = ?
    `).run(expiresAt, owner, pid);
    return result.changes === 1;
  }

  async release(owner: string, pid: number): Promise<void> {
    this.#database.prepare(
      "DELETE FROM hypit_worker_lease WHERE singleton = 1 AND owner_id = ? AND pid = ?",
    ).run(owner, pid);
  }
}

class SqliteRuntimeEnvironmentStore implements RuntimeEnvironmentStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async use(config: string): Promise<void> {
    assert(config.length > 0, "Runtime environment configuration is empty");
    transaction(this.#database, () => {
      const active = this.#database.prepare(
        `SELECT
          (SELECT COUNT(*) FROM hypit_submissions)
          + (SELECT COUNT(*) FROM hypit_executions) AS count`,
      ).get() as Row;
      assert(typeof active.count === "number", "SQLite active Runtime work count is invalid");
      const row = this.#database.prepare(
        "SELECT config_json FROM hypit_runtime_environment WHERE singleton = 1",
      ).get() as Row | undefined;
      if (active.count > 0) {
        assert(typeof row?.config_json === "string",
          "Active Runtime work has no recorded environment; use its original Profile or resolve it explicitly");
        assert(row.config_json === config,
          "Runtime Profile differs from the environment pinned by active Builds");
        return;
      }
      this.#database.prepare(`
        INSERT INTO hypit_runtime_environment (singleton, config_json) VALUES (1, ?)
        ON CONFLICT(singleton) DO UPDATE SET config_json = excluded.config_json
      `).run(config);
    });
  }

  async assert(config: string): Promise<void> {
    const row = this.#database.prepare(
      "SELECT config_json FROM hypit_runtime_environment WHERE singleton = 1",
    ).get() as Row | undefined;
    assert(typeof row?.config_json === "string" && row.config_json === config,
      "Runtime Profile no longer matches this Worker's active environment");
  }
}


function parseExecutionSnapshot(row: Row): BuildExecutionSnapshot {
  assert(typeof row.created_at === "number", "SQLite Execution creation time is invalid");
  assert(typeof row.wake_at === "number", "SQLite Execution wake time is invalid");
  assert((row.turn_owner === null && row.turn_acquired_at === null)
    || (typeof row.turn_owner === "string" && typeof row.turn_acquired_at === "number"),
  "SQLite Execution turn is invalid");
  assert((row.result_writer_owner === null && row.result_writer_acquired_at === null)
    || (typeof row.result_writer_owner === "string" && typeof row.result_writer_acquired_at === "number"),
  "SQLite Result-writer lease is invalid");
  assert((row.decision_outcome === null && row.decision_reason === null)
    || (row.decision_outcome === "complete" || row.decision_outcome === "failed" || row.decision_outcome === "cancelled"),
  "SQLite Execution decision is invalid");
  assert((row.attention_step === null && row.attention_error === null)
    || ((row.attention_step === "result" || row.attention_step === "cleanup")
      && typeof row.attention_error === "string"),
  "SQLite Execution attention is invalid");
  return {
    ...parseExecutionRequest(row, "Execution"),
    createdAt: row.created_at,
    wakeAt: row.wake_at,
    ...(typeof row.turn_owner === "string" ? {
      turn: { owner: row.turn_owner, acquiredAt: row.turn_acquired_at as number },
    } : {}),
    ...(typeof row.result_writer_owner === "string" ? {
      resultWrite: { owner: row.result_writer_owner, acquiredAt: row.result_writer_acquired_at as number },
    } : {}),
    ...(row.cancel_requested === 1 ? {
      cancellation: {
        ...(typeof row.cancellation_reason === "string" ? { reason: row.cancellation_reason } : {}),
      },
    } : {}),
    ...(typeof row.decision_outcome === "string" ? {
      decision: {
        outcome: row.decision_outcome as "complete" | "failed" | "cancelled",
        ...(typeof row.decision_reason === "string" ? { reason: row.decision_reason } : {}),
      },
    } : {}),
    ...(typeof row.attention_step === "string" ? {
      attention: {
        step: row.attention_step as "result" | "cleanup",
        error: row.attention_error as string,
      },
    } : {}),
  };
}

class SqliteBuildExecutionStore implements BuildExecutionStore {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  async create(
    request: BuildExecutionRequest,
    options: { readonly now?: number } = {},
  ): Promise<BuildExecutionSnapshot> {
    const now = options.now ?? Date.now();
    nonNegativeInteger(now, "Execution creation time");
    this.#database.prepare(`
      INSERT INTO hypit_executions (
        build_id, component_packages_json, result_location_json, created_at, wake_at,
        turn_owner, turn_acquired_at, result_writer_owner, result_writer_acquired_at,
        cancel_requested, cancellation_reason,
        decision_outcome, decision_reason, attention_step, attention_error
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL)
    `).run(request.build, JSON.stringify(request.componentPackages), JSON.stringify(request.result), now, now);
    return {
      ...copy(request),
      createdAt: now,
      wakeAt: now,
    };
  }

  async read(build: string): Promise<BuildExecutionSnapshot | undefined> {
    const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
    return row === undefined ? undefined : parseExecutionSnapshot(row);
  }

  async list(): Promise<readonly BuildExecutionSnapshot[]> {
    const rows = this.#database.prepare(`
      SELECT * FROM hypit_executions
      ORDER BY created_at ASC, build_id ASC
    `).all() as Row[];
    return rows.map(parseExecutionSnapshot);
  }

  async claim(owner: string, now = Date.now()): Promise<BuildExecutionSnapshot | undefined> {
    assert(owner.trim().length > 0, "Execution turn owner is empty");
    nonNegativeInteger(now, "Execution claim time");
    return transaction(this.#database, () => {
      const row = this.#database.prepare(`
        SELECT build_id FROM hypit_executions
        WHERE decision_outcome IS NULL AND turn_owner IS NULL AND wake_at <= ?
        ORDER BY wake_at ASC, created_at ASC, build_id ASC
        LIMIT 1
      `).get(now) as Row | undefined;
      if (row === undefined) return undefined;
      assert(typeof row.build_id === "string", "SQLite ready Execution has no Build id");
      const updated = this.#database.prepare(`
        UPDATE hypit_executions
        SET turn_owner = ?, turn_acquired_at = ?
        WHERE build_id = ? AND decision_outcome IS NULL AND turn_owner IS NULL AND wake_at <= ?
      `).run(owner, now, row.build_id, now);
      if (updated.changes !== 1) return undefined;
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(row.build_id) as Row,
      );
    });
  }

  async releaseTurn(build: string, owner: string, wakeAt: number): Promise<BuildExecutionSnapshot> {
    nonNegativeInteger(wakeAt, "Execution wakeAt");
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      assert(current.decision === undefined, `Execution ${build} already has a decision`);
      assert(current.turn?.owner === owner, `Execution ${build} is not owned by ${owner}`);
      if (current.cancellation !== undefined) return current;
      this.#database.prepare(`
        UPDATE hypit_executions
        SET turn_owner = NULL, turn_acquired_at = NULL, wake_at = ?
        WHERE build_id = ? AND turn_owner = ?
      `).run(wakeAt, build, owner);
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async decide(
    build: string,
    owner: string,
    outcome: "complete" | "failed" | "cancelled",
    reason?: string,
  ): Promise<BuildExecutionSnapshot> {
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      const effective = current.cancellation === undefined ? outcome : "cancelled";
      const effectiveReason = effective === "cancelled"
        ? current.cancellation?.reason ?? reason
        : reason;
      if (current.decision !== undefined) {
        assert(current.decision.outcome === effective && current.decision.reason === effectiveReason,
          `Execution ${build} already has a different decision`);
        return current;
      }
      assert(current.turn?.owner === owner, `Execution ${build} is not owned by ${owner}`);
      this.#database.prepare(`
        UPDATE hypit_executions
        SET decision_outcome = ?, decision_reason = ?, turn_owner = NULL, turn_acquired_at = NULL,
            attention_step = NULL, attention_error = NULL
        WHERE build_id = ? AND turn_owner = ? AND decision_outcome IS NULL
      `).run(effective, effectiveReason ?? null, build, owner);
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async setAttention(
    build: string,
    attention: BuildExecutionSnapshot["attention"],
  ): Promise<BuildExecutionSnapshot> {
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      assert(current.decision !== undefined, `Execution ${build} has no decision`);
      this.#database.prepare(`
        UPDATE hypit_executions
        SET attention_step = ?, attention_error = ?
        WHERE build_id = ?
      `).run(attention?.step ?? null, attention?.error ?? null, build);
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async claimResultWrite(
    build: string,
    owner: string,
    now = Date.now(),
  ): Promise<BuildExecutionSnapshot | undefined> {
    assert(owner.trim().length > 0, "Result-writer owner is empty");
    nonNegativeInteger(now, "Result-writer acquisition time");
    return transaction(this.#database, () => {
      const updated = this.#database.prepare(`
        UPDATE hypit_executions
        SET result_writer_owner = ?, result_writer_acquired_at = ?,
            attention_step = NULL, attention_error = NULL
        WHERE build_id = ? AND decision_outcome IS NOT NULL AND result_writer_owner IS NULL
      `).run(owner, now, build);
      if (updated.changes !== 1) return undefined;
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async releaseResultWrite(build: string, owner: string): Promise<BuildExecutionSnapshot> {
    return transaction(this.#database, () => {
      const updated = this.#database.prepare(`
        UPDATE hypit_executions
        SET result_writer_owner = NULL, result_writer_acquired_at = NULL
        WHERE build_id = ? AND result_writer_owner = ?
      `).run(build, owner);
      assert(updated.changes === 1, `Execution ${build} Result writer is not owned by ${owner}`);
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  async reclaimResultWrites(): Promise<readonly string[]> {
    return transaction(this.#database, () => {
      const rows = this.#database.prepare(
        "SELECT build_id FROM hypit_executions WHERE result_writer_owner IS NOT NULL",
      ).all() as Row[];
      const builds = rows.map((row) => {
        assert(typeof row.build_id === "string", "SQLite Result-writer lease has no Build id");
        return row.build_id;
      });
      for (const build of builds) {
        this.#database.prepare(`
          UPDATE hypit_executions
          SET result_writer_owner = NULL, result_writer_acquired_at = NULL,
              attention_step = 'result',
              attention_error = 'Result writing was interrupted; run hypit result finish <build-id>'
          WHERE build_id = ? AND result_writer_owner IS NOT NULL
        `).run(build);
      }
      return builds;
    });
  }

  async requestCancellation(build: string, reason?: string): Promise<BuildExecutionSnapshot> {
    const now = Date.now();
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      if (current.cancellation !== undefined) return current;
      if (current.decision !== undefined) return current;
      this.#database.prepare(`
        UPDATE hypit_executions
        SET wake_at = CASE WHEN turn_owner IS NULL THEN ? ELSE wake_at END,
            cancellation_reason = ?, cancel_requested = 1
        WHERE build_id = ?
      `).run(now, reason ?? null, build);
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row,
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
        "SELECT * FROM hypit_capacity WHERE build_id = ? AND command_id = ?",
      ).get(reservation.build, reservation.command) as Row | undefined;
      if (existing !== undefined) {
        return { status: "acquired", reservation: parseCapacityReservation(existing) };
      }
      for (const resource of resources) {
        const count = this.#database.prepare(`
          SELECT COUNT(DISTINCT capacity.rowid) AS count
          FROM hypit_capacity AS capacity, json_each(capacity.resources_json) AS claim
          WHERE json_extract(claim.value, '$.id') = ?
        `).get(resource.id) as Row;
        assert(typeof count.count === "number", `SQLite Capacity count for ${resource.id} is invalid`);
        if (count.count >= resource.limit) {
          return {
            status: "blocked",
            availableAt: request.now + 250,
            reason: "resource-in-flight",
            resource: resource.id,
          };
        }
      }
      this.#database.prepare(`
        INSERT INTO hypit_capacity (
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
      "DELETE FROM hypit_capacity WHERE build_id = ? AND command_id = ?",
    ).run(build, command);
  }

  async releaseBuildCapacity(build: string): Promise<void> {
    this.#database.prepare("DELETE FROM hypit_capacity WHERE build_id = ?").run(build);
  }

  async reclaimTurns(now = Date.now()): Promise<readonly string[]> {
    nonNegativeInteger(now, "Execution turn reclaim time");
    return transaction(this.#database, () => {
      const rows = this.#database.prepare(
        "SELECT build_id FROM hypit_executions WHERE turn_owner IS NOT NULL AND decision_outcome IS NULL",
      ).all() as Row[];
      const builds = rows.map((row) => {
        assert(typeof row.build_id === "string", "SQLite owned Execution has no Build id");
        return row.build_id;
      });
      for (const row of rows) {
        assert(typeof row.build_id === "string", "SQLite active Execution is invalid");
        this.#database.prepare(`
          UPDATE hypit_executions
          SET turn_owner = NULL, turn_acquired_at = NULL, wake_at = ?
          WHERE build_id = ? AND decision_outcome IS NULL
        `).run(now, row.build_id);
      }
      return builds;
    });
  }

  async listCapacity(): Promise<readonly CapacityReservation[]> {
    return (this.#database.prepare(
      "SELECT * FROM hypit_capacity ORDER BY created_at ASC, build_id ASC, command_id ASC",
    ).all() as Row[]).map(parseCapacityReservation);
  }
}

function parseCapacityReservation(row: Row): CapacityReservation {
  assert(typeof row.build_id === "string" && typeof row.command_id === "string"
    && typeof row.resources_json === "string"
    && typeof row.created_at === "number", "SQLite Capacity row is invalid");
  const storedResources = JSON.parse(row.resources_json) as readonly Readonly<Record<string, unknown>>[];
  const resources = storedResources.map((resource) => {
    assert(typeof resource.id === "string", "SQLite Capacity resource has no id");
    assert(typeof resource.limit === "number", `SQLite Capacity resource ${resource.id} has no limit`);
    return { id: resource.id, limit: positiveInteger(resource.limit, `resource ${resource.id} limit`) };
  });
  const value = {
    build: row.build_id,
    command: row.command_id,
    resources,
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
  readonly commandExecutions: CommandExecutionStore;
  readonly execution: BuildExecutionStore;
  readonly catalog: BuildCatalog;
  readonly workerLease: RuntimeWorkerLeaseStore;
  readonly environment: RuntimeEnvironmentStore;
  readonly submissions: PendingBuildStore;
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
      CREATE TABLE IF NOT EXISTS hypit_builds (
        build_id TEXT PRIMARY KEY,
        definition_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_build_facts (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        fact_json TEXT NOT NULL,
        UNIQUE (build_id, command_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_operations (
        operation_id TEXT PRIMARY KEY,
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        endpoint_id TEXT NOT NULL,
        pool_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
        payload_json TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_command_executions (
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('started', 'completed')),
        event_json TEXT,
        PRIMARY KEY (build_id, command_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_build_catalog (
        build_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        descriptor_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_submissions (
        build_id TEXT PRIMARY KEY,
        component_packages_json TEXT NOT NULL,
        result_location_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_executions (
        build_id TEXT PRIMARY KEY,
        component_packages_json TEXT NOT NULL,
        result_location_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        wake_at INTEGER NOT NULL,
        turn_owner TEXT,
        turn_acquired_at INTEGER,
        result_writer_owner TEXT,
        result_writer_acquired_at INTEGER,
        cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
        cancellation_reason TEXT,
        decision_outcome TEXT CHECK (
          decision_outcome IS NULL OR decision_outcome IN ('complete', 'failed', 'cancelled')
        ),
        decision_reason TEXT,
        attention_step TEXT CHECK (attention_step IS NULL OR attention_step IN ('result', 'cleanup')),
        attention_error TEXT,
        CHECK ((turn_owner IS NULL) = (turn_acquired_at IS NULL)),
        CHECK ((result_writer_owner IS NULL) = (result_writer_acquired_at IS NULL)),
        CHECK ((attention_step IS NULL) = (attention_error IS NULL))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS hypit_execution_ready
        ON hypit_executions (decision_outcome, turn_owner, wake_at);
      CREATE TABLE IF NOT EXISTS hypit_capacity (
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        resources_json TEXT NOT NULL,
        queue_json TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (build_id, command_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_worker_lease (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        owner_id TEXT NOT NULL,
        pid INTEGER NOT NULL,
        acquired_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_runtime_environment (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        config_json TEXT NOT NULL
      ) STRICT;
    `);
    this.builds = new SqliteBuildStore(database);
    this.operations = new SqliteOperationStore(database);
    this.commandExecutions = new SqliteCommandExecutionStore(database);
    this.execution = new SqliteBuildExecutionStore(database);
    this.catalog = new SqliteBuildCatalog(database);
    this.workerLease = new SqliteRuntimeWorkerLeaseStore(database);
    this.environment = new SqliteRuntimeEnvironmentStore(database);
    this.submissions = new SqlitePendingBuildStore(database);
  }

  /** Remove the complete active Runtime aggregate in one transaction, deleting its root last. */
  async removeActiveBuild(build: string): Promise<import("@hypit/runtime").BuildCompletion> {
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      assert(current.decision !== undefined, `Execution ${build} has no decision`);
      this.#database.prepare("DELETE FROM hypit_capacity WHERE build_id = ?").run(build);
      this.#database.prepare("DELETE FROM hypit_operations WHERE build_id = ?").run(build);
      this.#database.prepare("DELETE FROM hypit_command_executions WHERE build_id = ?").run(build);
      this.#database.prepare("DELETE FROM hypit_build_facts WHERE build_id = ?").run(build);
      this.#database.prepare("DELETE FROM hypit_build_catalog WHERE build_id = ?").run(build);
      this.#database.prepare("DELETE FROM hypit_builds WHERE build_id = ?").run(build);
      this.#database.prepare("DELETE FROM hypit_executions WHERE build_id = ?").run(build);
      return { build, ...current.decision };
    });
  }

  close(): void {
    this.#database.close();
  }
}
