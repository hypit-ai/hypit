import { isDigest } from "@narratage/protocol";
import type {
  Digest,
  LogicalOutputRef,
  RecordRef,
  TypeRef,
} from "@narratage/protocol";

export type BuildCatalogAlias = {
  readonly name: string;
  readonly type: TypeRef;
  readonly ref: RecordRef | LogicalOutputRef;
};

export type BuildCatalogDescriptor = {
  readonly format: "svml.build-catalog-descriptor@1";
  readonly core: Digest;
  readonly source: {
    readonly path: string;
    readonly closure: Digest;
  };
  readonly run?: {
    readonly path: string;
  };
  readonly aliases: readonly BuildCatalogAlias[];
};

export type BuildCatalogEntry = BuildCatalogDescriptor & {
  readonly build: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};

/** Host presentation index only. It is never Build truth or part of Runtime Closure. */
export type BuildCatalog = {
  record(build: string, descriptor: BuildCatalogDescriptor): Promise<BuildCatalogEntry>;
  read(build: string): Promise<BuildCatalogEntry | undefined>;
  list(): Promise<readonly BuildCatalogEntry[]>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function verifyType(type: TypeRef, subject: string): void {
  assert(type.module.name.trim().length > 0, `${subject} module name is empty`);
  assert(type.module.version.trim().length > 0, `${subject} module version is empty`);
  assert(type.name.trim().length > 0, `${subject} type name is empty`);
}

export function verifyBuildCatalogDescriptor(descriptor: BuildCatalogDescriptor): void {
  assert(descriptor.format === "svml.build-catalog-descriptor@1", "Build Catalog descriptor format is invalid");
  assert(isDigest(descriptor.core), "Build Catalog Core identity is invalid");
  assert(descriptor.source.path.trim().length > 0, "Build Catalog source path is empty");
  assert(isDigest(descriptor.source.closure), "Build Catalog source closure is invalid");
  if (descriptor.run !== undefined) {
    assert(descriptor.run.path.trim().length > 0, "Build Catalog Run path is empty");
  }
  const names = new Set<string>();
  for (const alias of descriptor.aliases) {
    assert(alias.name.trim().length > 0, "Build Catalog alias name is empty");
    assert(!names.has(alias.name), `Build Catalog repeats alias ${alias.name}`);
    names.add(alias.name);
    verifyType(alias.type, `Build Catalog alias ${alias.name}`);
    assert(alias.ref.kind === "record" || alias.ref.kind === "logical-output",
      `Build Catalog alias ${alias.name} has an unsupported reference`);
    assert(alias.ref.id.trim().length > 0, `Build Catalog alias ${alias.name} reference is empty`);
  }
}

export function verifyBuildCatalogEntry(entry: BuildCatalogEntry): void {
  verifyBuildCatalogDescriptor(entry);
  assert(entry.build.trim().length > 0, "Build Catalog build id is empty");
  assert(Number.isSafeInteger(entry.createdAt) && entry.createdAt >= 0, "Build Catalog createdAt is invalid");
  assert(Number.isSafeInteger(entry.updatedAt) && entry.updatedAt >= entry.createdAt,
    "Build Catalog updatedAt is invalid");
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryBuildCatalog implements BuildCatalog {
  readonly #entries = new Map<string, BuildCatalogEntry>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async record(build: string, descriptor: BuildCatalogDescriptor): Promise<BuildCatalogEntry> {
    assert(build.trim().length > 0, "Build Catalog build id is empty");
    verifyBuildCatalogDescriptor(descriptor);
    const existing = this.#entries.get(build);
    if (existing !== undefined) {
      assert(existing.core === descriptor.core, `Build Catalog ${build} already names another Core Build`);
    }
    const now = this.#now();
    assert(Number.isSafeInteger(now) && now >= 0, "Build Catalog clock returned an invalid time");
    const entry: BuildCatalogEntry = {
      ...copy(descriptor),
      build,
      createdAt: existing?.createdAt ?? now,
      updatedAt: Math.max(now, existing?.updatedAt ?? now),
    };
    verifyBuildCatalogEntry(entry);
    this.#entries.set(build, entry);
    return copy(entry);
  }

  async read(build: string): Promise<BuildCatalogEntry | undefined> {
    const entry = this.#entries.get(build);
    return entry === undefined ? undefined : copy(entry);
  }

  async list(): Promise<readonly BuildCatalogEntry[]> {
    return [...this.#entries.values()]
      .sort((left, right) => right.createdAt - left.createdAt || left.build.localeCompare(right.build))
      .map(copy);
  }
}
