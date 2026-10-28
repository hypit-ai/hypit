import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";

import type {
  BuildDefinition,
  BuildFact,
  CanonicalValue,
  CapabilityRef,
  CommandResult,
  Need,
  TypeRef,
} from "@hypit/hypit/protocol";
import { assertBuildId, compareCodeUnits, normalizeValue, valueBlobRefs } from "@hypit/hypit/protocol";
import { assertPublicationIntent } from "@hypit/hypit/protocol";
import { applyOperationUpdate, capacityUnits } from "@hypit/hypit/runtime";
import type {
  BuildSnapshot,
  BuildStore,
  CapacityAcquire,
  CapacityResourceClaim,
  CapacityAcquireRequest,
  CapacityReservation,
  CommandExecutionBegin,
  CommandExecutionActivity,
  CommandExecutionReceipt,
  CommandExecutionStore,
  OperationIdentity,
  OperationContext,
  OperationCancellation,
  OperationEvidence,
  OperationQuery,
  OperationSnapshot,
  OperationStore,
  OperationUpdate,
} from "@hypit/hypit/runtime";
import type { BuildCatalog, BuildCatalogDescriptor, BuildCatalogEntry } from "./catalog.js";
import type { PendingBuildCommit, PendingBuildSubmission, PendingBuildStore } from "./submission.js";
import type {
  BuildExecutionRequest,
  BuildExecutionSnapshot,
  BuildExecutionStop,
  BuildExecutionStore,
} from "./execution.js";

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
  return { build: row.build_id, definition, facts };
}

function operationIdentityFrom(snapshot: OperationSnapshot): OperationIdentity {
  return {
    id: snapshot.id,
    build: snapshot.build,
    command: snapshot.command,
    endpoint: snapshot.endpoint,
  };
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && !Array.isArray(value) && typeof value === "object", `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], subject: string): void {
  const permitted = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !permitted.has(key));
  assert(unexpected.length === 0, `${subject} has unexpected field ${unexpected[0]}`);
}

function nonEmptyString(value: unknown, subject: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${subject} must be a non-empty string`);
  return value;
}

function nonNegativeTime(value: unknown, subject: string): number {
  assert(typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    `${subject} must be a non-negative safe integer`);
  return value;
}

function optionalTime(value: unknown, subject: string): number | undefined {
  return value === undefined ? undefined : nonNegativeTime(value, subject);
}

function parseNamedRef(value: unknown, subject: string): { readonly module: { readonly name: string; readonly version: string }; readonly name: string } {
  const ref = object(value, subject);
  exactKeys(ref, ["module", "name"], subject);
  const module = object(ref.module, `${subject}.module`);
  exactKeys(module, ["name", "version"], `${subject}.module`);
  return {
    module: {
      name: nonEmptyString(module.name, `${subject}.module.name`),
      version: nonEmptyString(module.version, `${subject}.module.version`),
    },
    name: nonEmptyString(ref.name, `${subject}.name`),
  };
}

function parseNeed(value: unknown): Need {
  const need = object(value, "SQLite Operation Need");
  exactKeys(need, ["id", "capability", "returns", "constraints", "result"], "SQLite Operation Need");
  return {
    id: nonEmptyString(need.id, "SQLite Operation Need id"),
    capability: parseNamedRef(need.capability, "SQLite Operation Need capability") as CapabilityRef,
    returns: parseNamedRef(need.returns, "SQLite Operation Need return Type") as TypeRef,
    constraints: normalizeValue(need.constraints, "SQLite Operation Need constraints"),
    result: nonEmptyString(need.result, "SQLite Operation Need result"),
  };
}

function parseCredentials(value: unknown): OperationContext["credentials"] {
  const credentials = object(value, "SQLite Operation credential references");
  return Object.fromEntries(Object.entries(credentials).map(([slot, candidate]) => {
    assert(slot.trim().length > 0, "SQLite Operation credential slot must not be empty");
    const ref = object(candidate, `SQLite Operation credential ${slot}`);
    exactKeys(ref, ["store", "key"], `SQLite Operation credential ${slot}`);
    return [slot, {
      store: nonEmptyString(ref.store, `SQLite Operation credential ${slot} store`),
      key: nonEmptyString(ref.key, `SQLite Operation credential ${slot} key`),
    }];
  }));
}

function parseFailure(value: unknown): { readonly code: string; readonly message: string } {
  const failure = object(value, "SQLite Operation failure");
  exactKeys(failure, ["code", "message"], "SQLite Operation failure");
  return {
    code: nonEmptyString(failure.code, "SQLite Operation failure code"),
    message: nonEmptyString(failure.message, "SQLite Operation failure message"),
  };
}

function parseCancellation(value: unknown): OperationCancellation {
  const cancellation = object(value, "SQLite Operation cancellation");
  exactKeys(cancellation, ["outcome", "message"], "SQLite Operation cancellation");
  assert(cancellation.outcome === "confirmed" || cancellation.outcome === "accepted"
    || cancellation.outcome === "unsupported" || cancellation.outcome === "too-late"
    || cancellation.outcome === "failed", "SQLite Operation cancellation has invalid outcome");
  assert(cancellation.message === undefined || typeof cancellation.message === "string",
    "SQLite Operation cancellation message must be a string");
  return {
    outcome: cancellation.outcome,
    ...(cancellation.message === undefined ? {} : { message: cancellation.message }),
  };
}

function parseHandle(value: unknown): CanonicalValue {
  const handle = normalizeValue(value, "SQLite Operation handle");
  assert(valueBlobRefs(handle).length === 0, "SQLite Operation handle must not contain byte resources");
  return handle as CanonicalValue;
}

function parseEvidence(facts: Record<string, unknown>): OperationEvidence {
  const receipt = facts.receipt === undefined ? undefined : object(facts.receipt, "SQLite Operation receipt");
  if (receipt !== undefined) {
    exactKeys(receipt, ["id", "url"], "SQLite Operation receipt");
    nonEmptyString(receipt.id, "SQLite Operation receipt id");
    assert(receipt.url === undefined || typeof receipt.url === "string", "SQLite Operation receipt URL must be a string");
  }
  const progress = facts.progress === undefined ? undefined : object(facts.progress, "SQLite Operation progress");
  if (progress !== undefined) {
    exactKeys(progress, ["phase", "completed", "total", "unit"], "SQLite Operation progress");
    nonEmptyString(progress.phase, "SQLite Operation progress phase");
    for (const field of ["completed", "total"] as const) {
      assert(progress[field] === undefined || typeof progress[field] === "number" && Number.isFinite(progress[field]),
        `SQLite Operation progress ${field} must be finite`);
    }
    assert(progress.unit === undefined || typeof progress.unit === "string", "SQLite Operation progress unit must be a string");
  }
  return {
    ...(receipt === undefined ? {} : { receipt: {
      id: receipt.id as string,
      ...(receipt.url === undefined ? {} : { url: receipt.url as string }),
    } }),
    ...(progress === undefined ? {} : { progress: {
      phase: progress.phase as string,
      ...(progress.completed === undefined ? {} : { completed: progress.completed as number }),
      ...(progress.total === undefined ? {} : { total: progress.total as number }),
      ...(progress.unit === undefined ? {} : { unit: progress.unit as string }),
    } }),
  };
}

function parseOperationSnapshot(row: Row): OperationSnapshot {
  assert(row.status === "queued" || row.status === "submitting" || row.status === "running" || row.status === "collecting"
    || row.status === "received" || row.status === "completed"
    || row.status === "failed" || row.status === "cancelled", "SQLite Operation row has invalid status");
  const payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) as unknown : undefined;
  assert(payload !== null && !Array.isArray(payload) && typeof payload === "object",
    "SQLite Operation row has invalid payload");
  const facts = payload as Record<string, unknown>;
  const identity: OperationIdentity = {
    id: nonEmptyString(row.operation_id, "SQLite Operation id"),
    build: nonEmptyString(row.build_id, "SQLite Operation build id"),
    command: nonEmptyString(row.command_id, "SQLite Operation command id"),
    endpoint: nonEmptyString(row.endpoint_id, "SQLite Operation endpoint id"),
  };
  const commonKeys = ["createdAt", "need", "credentials", "pool", "receipt", "progress"] as const;
  const common = {
    ...identity,
    createdAt: nonNegativeTime(facts.createdAt, "SQLite Operation creation time"),
    need: parseNeed(facts.need),
    credentials: parseCredentials(facts.credentials),
    ...(facts.pool === undefined ? {} : { pool: nonEmptyString(facts.pool, "SQLite Operation pool") }),
    ...parseEvidence(facts),
  };
  if (row.status === "queued") {
    exactKeys(facts, [...commonKeys, "wakeAt"], "SQLite queued Operation payload");
    const wakeAt = optionalTime(facts.wakeAt, "SQLite queued Operation wake time");
    return { ...common, status: "queued", ...(wakeAt === undefined ? {} : { wakeAt }) };
  }
  if (row.status === "submitting") {
    exactKeys(facts, commonKeys, "SQLite submitting Operation payload");
    return { ...common, status: "submitting" };
  }
  if (row.status === "running") {
    exactKeys(facts, [...commonKeys, "handle", "acknowledgedAt", "wakeAt"], "SQLite running Operation payload");
    const wakeAt = optionalTime(facts.wakeAt, "SQLite running Operation wake time");
    return {
      ...common,
      status: "running",
      handle: parseHandle(facts.handle),
      acknowledgedAt: nonNegativeTime(facts.acknowledgedAt, "SQLite running Operation acknowledgement time"),
      ...(wakeAt === undefined ? {} : { wakeAt }),
    };
  }
  if (row.status === "collecting") {
    exactKeys(facts, [...commonKeys, "handle", "acknowledgedAt", "endedAt", "wakeAt"], "SQLite collecting Operation payload");
    const wakeAt = optionalTime(facts.wakeAt, "SQLite collecting Operation wake time");
    return {
      ...common,
      status: "collecting",
      handle: parseHandle(facts.handle),
      acknowledgedAt: nonNegativeTime(facts.acknowledgedAt, "SQLite collecting Operation acknowledgement time"),
      endedAt: nonNegativeTime(facts.endedAt, "SQLite collecting Operation end time"),
      ...(wakeAt === undefined ? {} : { wakeAt }),
    };
  }
  if (row.status === "received" || row.status === "completed") {
    exactKeys(facts, [...commonKeys, "value", "acknowledgedAt", "endedAt"], `SQLite ${row.status} Operation payload`);
    const completed = {
      ...common,
      value: normalizeValue(facts.value, "SQLite Operation value"),
      acknowledgedAt: nonNegativeTime(facts.acknowledgedAt, `SQLite ${row.status} Operation acknowledgement time`),
      endedAt: nonNegativeTime(facts.endedAt, `SQLite ${row.status} Operation end time`),
    };
    return row.status === "received"
      ? { ...completed, status: "received" }
      : { ...completed, status: "completed" };
  }
  if (row.status === "failed") {
    exactKeys(facts, [...commonKeys, "failure", "endedAt"], "SQLite failed Operation payload");
    return {
      ...common,
      status: "failed",
      failure: parseFailure(facts.failure),
      endedAt: nonNegativeTime(facts.endedAt, "SQLite failed Operation end time"),
    };
  }
  exactKeys(facts, [...commonKeys, "cancellation", "endedAt"], "SQLite cancelled Operation payload");
  return {
    ...common,
    status: "cancelled",
    cancellation: parseCancellation(facts.cancellation),
    endedAt: nonNegativeTime(facts.endedAt, "SQLite cancelled Operation end time"),
  };
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
    return { build, definition: storedDefinition, facts };
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
  const descriptor = object(JSON.parse(row.descriptor_json) as unknown, "SQLite Build Catalog descriptor");
  exactKeys(descriptor, ["sourcePath", "runPath", "publication"], "SQLite Build Catalog descriptor");
  assertPublicationIntent(descriptor.publication, { build: row.build_id });
  return {
    build: row.build_id,
    sourcePath: nonEmptyString(descriptor.sourcePath, "SQLite Build Catalog Source path"),
    ...(descriptor.runPath === undefined
      ? {}
      : { runPath: nonEmptyString(descriptor.runPath, "SQLite Build Catalog Run path") }),
    publication: descriptor.publication,
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
  assert(typeof row.execution_packages_json === "string", `SQLite ${subject} row has no execution packages`);
  assert(typeof row.result_location_json === "string", `SQLite ${subject} row has no Result location`);
  const executionPackages = JSON.parse(row.execution_packages_json) as unknown;
  assert(Array.isArray(executionPackages) && executionPackages.every((item) => typeof item === "string"),
    `SQLite ${subject} execution packages are invalid`);
  const result = object(JSON.parse(row.result_location_json) as unknown, `SQLite ${subject} Result location`);
  exactKeys(result, ["root", "path"], `SQLite ${subject} Result location`);
  return {
    build: row.build_id,
    ...(typeof row.context_json === "string"
      ? { context: normalizeValue(JSON.parse(row.context_json) as unknown, `SQLite ${subject} execution context`) }
      : {}),
    executionPackages,
    result: {
      root: nonEmptyString(result.root, `SQLite ${subject} Result root`),
      path: nonEmptyString(result.path, `SQLite ${subject} Result path`),
    },
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
          build_id, execution_packages_json, result_location_json, context_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        request.build,
        JSON.stringify(request.executionPackages),
        JSON.stringify(request.result),
        request.context === undefined ? null : JSON.stringify(request.context),
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
      assert(isDeepStrictEqual(submission.executionPackages, request.executionPackages)
        && isDeepStrictEqual(submission.result, request.result)
        && isDeepStrictEqual(submission.context, request.context),
      `Build submission ${request.build} does not match its prepared state`);
      this.#database.prepare(`
        INSERT INTO hypit_builds (build_id, definition_json) VALUES (?, ?)
      `).run(request.build, JSON.stringify(request.definition));
      this.#database.prepare(`
        INSERT INTO hypit_build_catalog (build_id, created_at, descriptor_json) VALUES (?, ?, ?)
      `).run(request.build, Date.now(), JSON.stringify(request.catalog));
      this.#database.prepare(`
        INSERT INTO hypit_executions (
          build_id, execution_packages_json, result_location_json, context_json, created_at, wake_at,
          turn_owner, turn_acquired_at, result_writer_owner, result_writer_acquired_at,
          stop_cause, stop_reason,
          decision_outcome, decision_reason, attention_step, attention_error
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
      `).run(
        request.build,
        JSON.stringify(request.executionPackages),
        JSON.stringify(request.result),
        request.context === undefined ? null : JSON.stringify(request.context),
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
      .sort((left, right) => compareCodeUnits(left.id, right.id));
  }

  async update(id: string, update: OperationUpdate): Promise<OperationSnapshot> {
    const current = await this.read(id);
    if (current === undefined) throw new Error(`Operation ${id} does not exist`);
    const next = applyOperationUpdate(current, copy(update));
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
  if (row.status === "completed") {
    return { build: row.build_id, command: row.command_id, status: "completed", event: event! };
  }
  return {
    build: row.build_id,
    command: row.command_id,
    status: "started",
    ...(typeof row.activity_json !== "string" ? {} : {
      activity: JSON.parse(row.activity_json) as CommandExecutionActivity,
    }),
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
        UPDATE hypit_command_executions SET status = 'completed', event_json = ?, activity_json = NULL
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

  async reportProgress(build: string, command: string, activity: CommandExecutionActivity): Promise<void> {
    this.#database.prepare(`
      UPDATE hypit_command_executions SET activity_json = ?
      WHERE build_id = ? AND command_id = ? AND status = 'started'
    `).run(JSON.stringify(activity), build, command);
  }

  async removeBuild(build: string): Promise<void> {
    this.#database.prepare("DELETE FROM hypit_command_executions WHERE build_id = ?").run(build);
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
    || (row.decision_outcome === "complete" && row.decision_reason === null)
    || ((row.decision_outcome === "failed" || row.decision_outcome === "cancelled")
      && typeof row.decision_reason === "string"),
  "SQLite Execution decision is invalid");
  assert((row.attention_step === null && row.attention_error === null)
    || ((row.attention_step === "result" || row.attention_step === "cleanup")
      && typeof row.attention_error === "string"),
  "SQLite Execution attention is invalid");
  return {
    ...parseExecutionRequest(row, "Execution"),
    createdAt: row.created_at,
    ...(typeof row.started_at === "number" ? { startedAt: row.started_at } : {}),
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
    ...(row.decision_outcome === "complete" ? {
      decision: { outcome: "complete" as const },
    } : row.decision_outcome === "failed" || row.decision_outcome === "cancelled" ? {
      decision: { outcome: row.decision_outcome, reason: row.decision_reason as string },
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
        build_id, execution_packages_json, result_location_json, context_json, created_at, wake_at,
        turn_owner, turn_acquired_at, result_writer_owner, result_writer_acquired_at,
        stop_cause, stop_reason,
        decision_outcome, decision_reason, attention_step, attention_error
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    `).run(request.build, JSON.stringify(request.executionPackages), JSON.stringify(request.result), request.context === undefined ? null : JSON.stringify(request.context), now, now);
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

  async claim(owner: string, now = Date.now(), build?: string): Promise<BuildExecutionSnapshot | undefined> {
    assert(owner.trim().length > 0, "Execution turn owner is empty");
    nonNegativeInteger(now, "Execution claim time");
    return transaction(this.#database, () => {
      const row = this.#database.prepare(`
        SELECT execution.build_id FROM hypit_executions AS execution
        WHERE decision_outcome IS NULL AND turn_owner IS NULL AND wake_at <= ?
          AND (? IS NULL OR execution.build_id = ?)
        ORDER BY EXISTS (
          SELECT 1 FROM hypit_capacity AS capacity
          WHERE capacity.build_id = execution.build_id
        ) DESC, wake_at ASC, created_at ASC, execution.build_id ASC
        LIMIT 1
      `).get(now, build ?? null, build ?? null) as Row | undefined;
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

  async listUnstarted(): Promise<readonly string[]> {
    return (this.#database.prepare(`SELECT build_id FROM hypit_executions
      WHERE decision_outcome IS NULL AND started_at IS NULL ORDER BY created_at, build_id`).all() as Row[])
      .map((row) => row.build_id as string);
  }

  async listReady(now = Date.now()): Promise<readonly string[]> {
    return (this.#database.prepare(`SELECT build_id FROM hypit_executions
      WHERE decision_outcome IS NULL AND turn_owner IS NULL AND wake_at <= ?
      ORDER BY wake_at, created_at, build_id`).all(now) as Row[]).map((row) => row.build_id as string);
  }

  async start(build: string, now = Date.now()): Promise<BuildExecutionSnapshot> {
    nonNegativeInteger(now, "Execution start time");
    const updated = this.#database.prepare(`
      UPDATE hypit_executions SET started_at = ?
      WHERE build_id = ? AND started_at IS NULL AND decision_outcome IS NULL
    `).run(now, build);
    assert(updated.changes === 1, `Execution ${build} has already started or ended`);
    return (await this.read(build))!;
  }

  async interrupt(build: string, reason: string): Promise<BuildExecutionSnapshot> {
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      assert(row !== undefined, `Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      if (current.decision !== undefined) return current;
      this.#release(build);
      this.#database.prepare(`
        UPDATE hypit_executions SET decision_outcome = ?, decision_reason = ?,
          turn_owner = NULL, turn_acquired_at = NULL,
          result_writer_owner = NULL, result_writer_acquired_at = NULL
        WHERE build_id = ?
      `).run(current.stop?.cause === "user-cancelled" ? "cancelled" : "failed", current.stop?.reason ?? reason, build);
      return parseExecutionSnapshot(this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row);
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
    decision: import("./execution.js").BuildExecutionDecision,
  ): Promise<BuildExecutionSnapshot> {
    return transaction(this.#database, () => {
      const row = this.#database.prepare("SELECT * FROM hypit_executions WHERE build_id = ?").get(build) as Row | undefined;
      if (row === undefined) throw new Error(`Execution ${build} does not exist`);
      const current = parseExecutionSnapshot(row);
      const effective: import("./execution.js").BuildExecutionDecision = current.stop === undefined
        ? decision
        : current.stop.cause === "user-cancelled"
          ? { outcome: "cancelled", reason: current.stop.reason ?? "Cancelled by user" }
          : { outcome: "failed", reason: current.stop.reason ?? "Execution failed" };
      if (current.decision !== undefined) {
        assert(current.decision.outcome === effective.outcome && current.decision.reason === effective.reason,
          `Execution ${build} already has a different decision`);
        return current;
      }
      assert(current.turn?.owner === owner, `Execution ${build} is not owned by ${owner}`);
      this.#database.prepare(`
        UPDATE hypit_executions
        SET decision_outcome = ?, decision_reason = ?, turn_owner = NULL, turn_acquired_at = NULL,
            attention_step = NULL, attention_error = NULL
        WHERE build_id = ? AND turn_owner = ? AND decision_outcome IS NULL
      `).run(effective.outcome, effective.reason ?? null, build, owner);
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
    const previousLimit = row.limit_units as number;
    const previousPeriod = row.period_ms as number;
    const carried = Math.min(previousLimit, (row.tokens as number)
      + Math.max(0, now - (row.updated_at as number)) * previousLimit / previousPeriod);
    const available = Math.min(resource.limit, carried);
    if (previousLimit !== resource.limit || previousPeriod !== resource.periodMs) {
      this.#database.prepare(`
        UPDATE hypit_rates SET limit_units = ?, period_ms = ?, tokens = ?, updated_at = ?
        WHERE resource_id = ?
      `).run(resource.limit, resource.periodMs!, available, now, resource.id);
    }
    return available;
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
    const resources = [...request.resources].sort((left, right) => compareCodeUnits(left.id, right.id));
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
          ON CONFLICT(resource_id) DO UPDATE SET
            limit_units = excluded.limit_units,
            period_ms = excluded.period_ms,
            tokens = excluded.tokens,
            updated_at = excluded.updated_at
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
        status TEXT NOT NULL CHECK (status IN ('queued', 'submitting', 'running', 'collecting', 'received', 'completed', 'failed', 'cancelled')),
        payload_json TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_command_executions (
        build_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('started', 'completed')),
        event_json TEXT,
        activity_json TEXT,
        PRIMARY KEY (build_id, command_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_build_catalog (
        build_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        descriptor_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_submissions (
        build_id TEXT PRIMARY KEY,
        execution_packages_json TEXT NOT NULL,
        result_location_json TEXT NOT NULL,
        context_json TEXT,
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS hypit_executions (
        build_id TEXT PRIMARY KEY,
        execution_packages_json TEXT NOT NULL,
        result_location_json TEXT NOT NULL,
        context_json TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
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
    `);
    this.builds = new SqliteBuildStore(database);
    this.operations = new SqliteOperationStore(database);
    this.commandExecutions = new SqliteCommandExecutionStore(database);
    this.execution = new SqliteBuildExecutionStore(database);
    this.catalog = new SqliteBuildCatalog(database);
    this.submissions = new SqlitePendingBuildStore(database);
  }

  /** Remove the complete active Runtime aggregate in one transaction, deleting its root last. */
  async removeActiveBuild(build: string): Promise<import("./execution.js").BuildCompletion> {
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
