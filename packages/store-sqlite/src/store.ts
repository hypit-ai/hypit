import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  canonicalStringify,
  verifyBuildState,
} from "@svml/core";
import { digestOf } from "@svml/protocol";
import type {
  BuildState,
  Digest,
} from "@svml/protocol";
import {
  defineRuntimeServicePackage,
  sealOperationCompletion,
  verifyOperationIdentity,
  verifyOperationSnapshot,
} from "@svml/runtime";
import type {
  BuildSnapshot,
  BuildStore,
  BuildStoreWrite,
  OperationCreate,
  OperationIdentity,
  OperationQuery,
  OperationSnapshot,
  OperationStore,
  OperationStoreWrite,
  OperationUpdate,
  RuntimeServicePackage,
} from "@svml/runtime";

const schemaVersion = 1;

export const sqliteStoreModuleRef = {
  name: "@svml/store-sqlite",
  version: "1",
} as const;

export const sqliteBuildStoreImplementationDigest = digestOf(
  "@svml/store-sqlite/build-store@1",
);

export const sqliteOperationStoreImplementationDigest = digestOf(
  "@svml/store-sqlite/operation-store@1",
);

export type SqliteRuntimeStateOptions = {
  readonly busyTimeoutMs?: number;
};

export type CreateSqliteRuntimeServicePackageOptions = SqliteRuntimeStateOptions & {
  readonly path: string;
  readonly name?: string;
  readonly buildInstance?: string;
  readonly operationInstance?: string;
};

type Row = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

function durableBuildState(state: BuildState): BuildState {
  verifyBuildState(state);
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
    implementationDigest: snapshot.implementationDigest,
    runtimeClosure: snapshot.runtimeClosure,
    requestDigest: snapshot.requestDigest,
    attempt: snapshot.attempt,
    submissionKey: snapshot.submissionKey,
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
      }
    : undefined;
  const mutable = row.status === "pending"
    ? pending?.format === "svml.operation-pending@1" && pending.checkpoint !== undefined
      ? {
          checkpoint: pending.checkpoint,
          ...(pending.wakeAt === undefined ? {} : { wakeAt: pending.wakeAt }),
        }
      : { checkpoint: pending }
    : row.status === "completed"
      ? { completion: JSON.parse(String(row.completion_json)) }
      : row.status === "failed"
        ? { failure: JSON.parse(String(row.failure_json)) }
        : {};
  const snapshot = {
    ...identity,
    revision: row.revision,
    status: row.status,
    ...mutable,
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
        checkpoint_json, completion_json, failure_json
      ) VALUES (?, 0, 'created', ?, NULL, NULL, NULL)
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
      SELECT identity_json, revision, status, checkpoint_json, completion_json, failure_json
      FROM svml_operations
      WHERE operation_id = ?
    `).get(id) as Row | undefined;
    return row === undefined ? undefined : parseOperationSnapshot(row);
  }

  async list(query: OperationQuery): Promise<readonly OperationSnapshot[]> {
    const rows = this.#database.prepare(`
      SELECT identity_json, revision, status, checkpoint_json, completion_json, failure_json
      FROM svml_operations
      ORDER BY operation_id ASC
    `).all() as Row[];
    return rows.map(parseOperationSnapshot)
      .filter((snapshot) => query.build === undefined || snapshot.build === query.build)
      .filter((snapshot) => query.command === undefined || snapshot.command === query.command)
      .filter((snapshot) => query.endpoint === undefined || snapshot.endpoint === query.endpoint)
      .filter((snapshot) => query.runtimeClosure === undefined || snapshot.runtimeClosure === query.runtimeClosure)
      .filter((snapshot) => query.requestDigest === undefined || snapshot.requestDigest === query.requestDigest)
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
    assert(current.status !== "completed" && current.status !== "failed", `Operation ${id} is already terminal`);
    const checkpoint = update.status === "pending" ? canonicalStringify({
      format: "svml.operation-pending@1",
      checkpoint: update.checkpoint,
      ...(update.wakeAt === undefined ? {} : { wakeAt: update.wakeAt }),
    }) : null;
    const completion = update.status === "completed"
      ? canonicalStringify(sealOperationCompletion(update.completion))
      : null;
    const failure = update.status === "failed" ? canonicalStringify(update.failure) : null;
    const result = this.#database.prepare(`
      UPDATE svml_operations
      SET revision = ?, status = ?, checkpoint_json = ?, completion_json = ?, failure_json = ?
      WHERE operation_id = ? AND revision = ? AND status NOT IN ('completed', 'failed')
    `).run(expectedRevision + 1, update.status, checkpoint, completion, failure, id, expectedRevision);
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

/** One local database, two deliberately separate persistence ports, and no durable ready queue. */
export class SqliteRuntimeState {
  readonly path: string;
  readonly builds: BuildStore;
  readonly operations: OperationStore;
  readonly #database: DatabaseSync;

  constructor(path: string, options: SqliteRuntimeStateOptions = {}) {
    assert(path.trim().length > 0, "SQLite path must not be empty");
    const absolute = resolve(path);
    mkdirSync(dirname(absolute), { recursive: true });
    const database = new DatabaseSync(absolute);
    this.path = absolute;
    this.#database = database;
    this.#database.exec(`PRAGMA busy_timeout = ${positiveInteger(options.busyTimeoutMs ?? 5_000, "busyTimeoutMs")}`);
    this.#database.exec("PRAGMA journal_mode = WAL");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
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
        status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'completed', 'failed')),
        identity_json TEXT NOT NULL,
        checkpoint_json TEXT,
        completion_json TEXT,
        failure_json TEXT
      ) STRICT;
    `);
    const version = this.#database.prepare("SELECT schema_version FROM svml_store_meta WHERE singleton = 1").get() as Row | undefined;
    if (version === undefined) {
      this.#database.prepare("INSERT OR IGNORE INTO svml_store_meta (singleton, schema_version) VALUES (1, ?)").run(schemaVersion);
    } else {
      assert(version.schema_version === schemaVersion,
        `unsupported @svml/store-sqlite schema ${String(version.schema_version)}`);
    }
    this.builds = new SqliteBuildStore(database);
    this.operations = new SqliteOperationStore(database);
  }

  close(): void {
    this.#database.close();
  }
}

export function createSqliteRuntimeServicePackage(
  options: CreateSqliteRuntimeServicePackageOptions,
): RuntimeServicePackage {
  const state = new SqliteRuntimeState(options.path, {
    ...(options.busyTimeoutMs === undefined ? {} : { busyTimeoutMs: options.busyTimeoutMs }),
  });
  const buildInstance = options.buildInstance ?? "builds.sqlite";
  const operationInstance = options.operationInstance ?? "operations.sqlite";
  try {
    return defineRuntimeServicePackage({
      name: options.name ?? "state.sqlite",
      module: sqliteStoreModuleRef,
      services: [
        {
          role: "build-store",
          facet: "build-store",
          instance: buildInstance,
          implementation: {
            locator: "@svml/store-sqlite/build-store",
            digest: sqliteBuildStoreImplementationDigest,
          },
          permissions: ["filesystem:state"],
          configuration: {
            path: state.path,
            schemaVersion,
            busyTimeoutMs: options.busyTimeoutMs ?? 5_000,
          },
          service: state.builds,
        },
        {
          role: "operation-store",
          facet: "operation-store",
          instance: operationInstance,
          implementation: {
            locator: "@svml/store-sqlite/operation-store",
            digest: sqliteOperationStoreImplementationDigest,
          },
          permissions: ["filesystem:state"],
          configuration: {
            path: state.path,
            schemaVersion,
            busyTimeoutMs: options.busyTimeoutMs ?? 5_000,
          },
          service: state.operations,
        },
      ],
      close: () => state.close(),
    });
  } catch (error) {
    state.close();
    throw error;
  }
}
