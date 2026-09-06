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
import { capacityUnits } from "@hypit/runtime";
import type {
  PendingBuildCommit,
  PendingBuildSubmission,
  PendingBuildStore,
  BuildExecutionRequest,
  BuildExecutionSnapshot,
  BuildExecutionStop,
  BuildExecutionStore,
  BuildCatalog,
  BuildCatalogDescriptor,
  BuildCatalogEntry,
  BuildSnapshot,
  BuildStore,
  CapacityAcquire,
  CapacityResourceClaim,
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
  };
}

function parseOperationSnapshot(row: Row): OperationSnapshot {
  for (const field of ["operation_id", "build_id", "command_id", "endpoint_id"] as const) {
    assert(typeof row[field] === "string", `SQLite Operation row has no ${field}`);
  }
  assert(typeof row.status === "string", "SQLite Operation row has no status");
  const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) as unknown : undefined;
  return {
    id: row.operation_id, build: row.build_id, command: row.command_id,
    endpoint: row.endpoint_id, status: row.status,
    ...(payload as object ?? {}),
  } as OperationSnapshot;
}

function operationPayload(operation: OperationSnapshot): string {
  const { id: _id, build: _build, command: _command, endpoint: _endpoint, status: _status, ...facts } = operation;
  return JSON.stringify(facts);
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
          stop_cause, stop_reason,
          decision_outcome, decision_reason, attention_step, attention_error
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
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
    const payload = operationPayload(operation);
    const result = this.#database.prepare(`
      INSERT INTO hypit_operations (
        operation_id, build_id, command_id, endpoint_id, status,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(identity.id, identity.build, identity.command, identity.endpoint, operation.status, payload);
    if (result.changes !== 1) throw new Error(`Operation ${identity.id} was not created`);
    return copy(operation);
  }

  async read(id: string): Promise<OperationSnapshot | undefined> {
    const row = this.#database.prepare(`
      SELECT operation_id, build_id, command_id, endpoint_id,
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
      SELECT operation_id, build_id, command_id, endpoint_id,
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
    const next = { ...current, ...copy(update) } as OperationSnapshot;
    // Progress and timers describe the next action; acknowledgement and request
    // facts survive success/failure until the Result has saved the receipt.
    if (update.status !== "pending" || update.wakeAt === undefined) delete (next as { wakeAt?: number }).wakeAt;
    const result = this.#database.prepare(`
      UPDATE hypit_operations SET status = ?, payload_json = ? WHERE operation_id = ?
    `).run(next.status, operationPayload(next), id);
    if (result.changes !== 1) throw new Error(`Operation ${id} disappeared during update`);
    return next;
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
  assert(row.wake_at === null || typeof row.wake_at === "number", "SQLite Execution wake time is invalid");
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
    ...(typeof row.wake_at === "number" ? { wakeAt: row.wake_at } : {}),
    ...(typeof row.operation_wait_json === "string" ? { operationWait: JSON.parse(row.operation_wait_json) as string[] } : {}),
    ...(typeof row.turn_owner === "string" ? {
      turn: { owner: row.turn_owner, acquiredAt: row.turn_acquired_at as number },
    } : {}),
    ...(typeof row.result_writer_owner === "string" ? {
      resultWrite: { owner: row.result_writer_owner, acquiredAt: row.result_writer_acquired_at as number },
    } : {}),
    ...(row.stop_cause === "user-cancelled" || row.stop_cause === "execution-failed" ? {
      stop: {
        cause: row.stop_cause,
        ...(typeof row.stop_reason === "string" ? { reason: row.stop_reason } : {}),
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
        stop_cause, stop_reason,
        decision_outcome, decision_reason, attention_step, attention_error
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
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
        SELECT execution.build_id FROM hypit_executions AS execution
        WHERE decision_outcome IS NULL AND turn_owner IS NULL AND wake_at <= ?
        ORDER BY EXISTS (
          SELECT 1 FROM hypit_capacity AS capacity
          WHERE capacity.build_id = execution.build_id
        ) DESC, wake_at ASC, created_at ASC, execution.build_id ASC
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

  async releaseTurn(build: string, owner: string, wakeAt: number | undefined, operationWait?: readonly string[]): Promise<BuildExecutionSnapshot> {
    if (wakeAt !== undefined) nonNegativeInteger(wakeAt, "Execution wakeAt");
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      assert(current.decision === undefined, `Execution ${build} already has a decision`);
      assert(current.turn?.owner === owner, `Execution ${build} is not owned by ${owner}`);
      // A release can race this turn. Recheck parked claims in this transaction so
      // that a notification received before releaseTurn is not lost.
      const now = Date.now();
      const readyWait = current.stop === undefined && (this.#database.prepare(
        "SELECT resources_json FROM hypit_resource_waits WHERE build_id = ?",
      ).all(build) as Row[]).some((wait) => this.#blocked(JSON.parse(wait.resources_json as string), now) === undefined);
      const next = current.stop !== undefined || readyWait
        ? Math.min(wakeAt ?? now, now) : wakeAt;
      this.#database.prepare(`
        UPDATE hypit_executions
        SET turn_owner = NULL, turn_acquired_at = NULL, wake_at = ?, operation_wait_json = ?
        WHERE build_id = ? AND turn_owner = ?
      `).run(next ?? null, readyWait || operationWait === undefined ? null : JSON.stringify(operationWait), build, owner);
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
      const effective = current.stop === undefined ? outcome
        : current.stop.cause === "user-cancelled" ? "cancelled" : "failed";
      const effectiveReason = current.stop === undefined ? reason : current.stop.reason;
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

  async requestStop(build: string, stop: BuildExecutionStop): Promise<BuildExecutionSnapshot> {
    const now = Date.now();
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      if (current.stop !== undefined) return current;
      if (current.decision !== undefined) return current;
      this.#database.prepare(`
        UPDATE hypit_executions
        SET wake_at = CASE WHEN turn_owner IS NULL THEN ? ELSE wake_at END,
            stop_reason = ?, stop_cause = ?
        WHERE build_id = ?
      `).run(now, stop.reason ?? null, stop.cause, build);
      return parseExecutionSnapshot(
        this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row,
      );
    });
  }

  #rate(resource: CapacityResourceClaim, now: number): number {
    const row = this.#database.prepare("SELECT * FROM hypit_rates WHERE resource_id = ?").get(resource.id) as Row | undefined;
    if (row === undefined) return resource.limit;
    assert(row.limit_units === resource.limit && row.period_ms === resource.periodMs,
      `Shared rate ${resource.id} has conflicting limit or periodMs`);
    return Math.min(resource.limit, (row.tokens as number)
      + Math.max(0, now - (row.updated_at as number)) * resource.limit / resource.periodMs!);
  }

  #blocked(resources: readonly CapacityResourceClaim[], now: number): Extract<CapacityAcquire, { status: "blocked" }> | undefined {
    for (const resource of resources) {
      const units = capacityUnits(resource);
      if (resource.periodMs !== undefined) {
        const tokens = this.#rate(resource, now);
        if (tokens + 1e-9 < units) return {
          status: "blocked", availableAt: now + Math.ceil((units - tokens) * resource.periodMs / resource.limit),
          reason: "rate-limit", resource: resource.id,
        };
      } else {
        const count = this.#database.prepare(`
          SELECT COALESCE(SUM(COALESCE(json_extract(claim.value, '$.units'), 1)), 0) AS count
          FROM hypit_capacity AS capacity, json_each(capacity.resources_json) AS claim
          WHERE json_extract(claim.value, '$.id') = ?
        `).get(resource.id) as Row;
        if ((count.count as number) + units > resource.limit) return {
          status: "blocked", reason: "resource-in-flight", resource: resource.id,
        };
      }
    }
    return undefined;
  }

  async acquireCapacity(request: CapacityAcquireRequest): Promise<CapacityAcquire> {
    nonNegativeInteger(request.now, "Resource acquisition time");
    assert(request.resources.length > 0, "Resources are empty");
    const resources = [...request.resources].sort((left, right) => left.id.localeCompare(right.id));
    assert(new Set(resources.map((resource) => resource.id)).size === resources.length, "Resources repeat an id");
    for (const resource of resources) capacityUnits(resource);
    return transaction(this.#database, () => {
      const existing = this.#database.prepare(
        "SELECT * FROM hypit_capacity WHERE build_id = ? AND command_id = ?",
      ).get(request.build, request.command) as Row | undefined;
      if (existing !== undefined) return { status: "acquired", reservation: parseCapacityReservation(existing) };
      const blocked = this.#blocked(resources, request.now);
      if (blocked !== undefined) {
        this.#database.prepare(`
          INSERT INTO hypit_resource_waits (build_id, command_id, resource_id, resources_json) VALUES (?, ?, ?, ?)
          ON CONFLICT(build_id, command_id) DO UPDATE SET resource_id = excluded.resource_id, resources_json = excluded.resources_json
        `).run(request.build, request.command, blocked.resource, JSON.stringify(resources));
        return blocked;
      }
      for (const resource of resources) {
        if (resource.periodMs === undefined) continue;
        this.#database.prepare(`
          INSERT INTO hypit_rates (resource_id, limit_units, period_ms, tokens, updated_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(resource_id) DO UPDATE SET tokens = excluded.tokens, updated_at = excluded.updated_at
        `).run(resource.id, resource.limit, resource.periodMs, this.#rate(resource, request.now) - capacityUnits(resource), request.now);
      }
      const reservation: CapacityReservation = {
        build: request.build, command: request.command, createdAt: request.now,
        resources: resources.filter((resource) => resource.periodMs === undefined),
        lifetime: request.lifetime ?? "operation",
      };
      if (reservation.resources.length > 0) this.#database.prepare(`
        INSERT INTO hypit_capacity (build_id, command_id, resources_json, created_at, lifetime) VALUES (?, ?, ?, ?, ?)
      `).run(request.build, request.command, JSON.stringify(reservation.resources), request.now, reservation.lifetime!);
      this.#database.prepare("DELETE FROM hypit_resource_waits WHERE build_id = ? AND command_id = ?").run(request.build, request.command);
      this.#wakeAvailableWaiter();
      return { status: "acquired", reservation };
    });
  }

  #release(build: string, command?: string): void {
    const where = command === undefined ? "build_id = ?" : "build_id = ? AND command_id = ?";
    const args = command === undefined ? [build] : [build, command];
    this.#database.prepare(`DELETE FROM hypit_capacity WHERE ${where}`).run(...args);
    if (command === undefined) this.#database.prepare("DELETE FROM hypit_resource_waits WHERE build_id = ?").run(build);
    this.#wakeAvailableWaiter();
  }

  #wakeAvailableWaiter(): void {
    const now = Date.now();
    const waits = this.#database.prepare(`
      SELECT waits.build_id, waits.resources_json FROM hypit_resource_waits AS waits
      JOIN hypit_executions AS execution ON execution.build_id = waits.build_id
      WHERE execution.decision_outcome IS NULL AND execution.stop_cause IS NULL
        AND execution.turn_owner IS NULL AND (execution.wake_at IS NULL OR execution.wake_at > ?)
      ORDER BY execution.created_at, waits.rowid
    `).all(now) as Row[];
    for (const wait of waits) {
      if (this.#blocked(JSON.parse(wait.resources_json as string), now) !== undefined) continue;
      this.#database.prepare("UPDATE hypit_executions SET wake_at = ?, operation_wait_json = NULL WHERE build_id = ?")
        .run(now, wait.build_id as string);
      break;
    }
  }

  async releaseCapacity(build: string, command: string): Promise<void> {
    transaction(this.#database, () => this.#release(build, command));
  }

  async reclaimActionCapacity(): Promise<void> {
    transaction(this.#database, () => {
      const rows = this.#database.prepare("SELECT build_id, command_id FROM hypit_capacity WHERE lifetime = 'action'").all() as Row[];
      for (const row of rows) this.#release(row.build_id as string, row.command_id as string);
    });
  }

  async releaseBuildCapacity(build: string): Promise<void> {
    transaction(this.#database, () => this.#release(build));
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
    const claim = { id: resource.id, limit: positiveInteger(resource.limit, `resource ${resource.id} limit`),
      ...(resource.units === undefined ? {} : { units: positiveInteger(resource.units as number, `resource ${resource.id} units`) }) };
    capacityUnits(claim);
    return claim;
  });
  const value = {
    build: row.build_id,
    command: row.command_id,
    resources,
    lifetime: row.lifetime as "action" | "operation",
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
        wake_at INTEGER,
        operation_wait_json TEXT,
        turn_owner TEXT,
        turn_acquired_at INTEGER,
        result_writer_owner TEXT,
        result_writer_acquired_at INTEGER,
        stop_cause TEXT CHECK (stop_cause IS NULL OR stop_cause IN ('user-cancelled', 'execution-failed')),
        stop_reason TEXT,
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
        created_at INTEGER NOT NULL,
        lifetime TEXT NOT NULL CHECK (lifetime IN ('action', 'operation')),
        PRIMARY KEY (build_id, command_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_resource_waits (
        build_id TEXT NOT NULL, command_id TEXT NOT NULL, resource_id TEXT NOT NULL,
        resources_json TEXT NOT NULL, PRIMARY KEY (build_id, command_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS hypit_resource_waiters ON hypit_resource_waits (resource_id);
      CREATE TABLE IF NOT EXISTS hypit_rates (
        resource_id TEXT PRIMARY KEY, limit_units INTEGER NOT NULL, period_ms INTEGER NOT NULL,
        tokens REAL NOT NULL, updated_at INTEGER NOT NULL
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
      this.#database.prepare("DELETE FROM hypit_resource_waits WHERE build_id = ?").run(build);
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
