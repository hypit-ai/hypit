import { createHash, randomUUID } from "node:crypto";
import {
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { createRequire } from "node:module";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

import { digestOf, isDigest, modulePackageAbi } from "@narratage/protocol";

import { collectNodePackageComponents } from "./contribution.js";
import type {
  LogicalPackageAddress,
  NodePackageBinding,
  LockedNodePackage,
  LockedPackageArtifact,
  LoadedNodePackageSet,
  NodePackageContribution,
  NodePackageLockCreateOptions,
  NodePackageSelectionRequest,
  NodePackageLock,
} from "./types.js";

type PackageJson = {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
  readonly svml?: {
    readonly activation?: string;
  };
};

type ResolvedPhysicalPackage = {
  readonly root: string;
  readonly json: PackageJson;
};

type ReachablePhysicalPackage = {
  readonly physical: ResolvedPhysicalPackage;
  /** Direct selection roots that can reach this physical package. Ephemeral; never serialized. */
  readonly roots: ReadonlySet<string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, subject: string): string {
  assert(typeof value === "string" && value.length > 0, `${subject} must be a non-empty string`);
  return value;
}

function parsePackageJson(value: unknown, subject: string): PackageJson {
  const parsed = object(value, subject);
  const svml = parsed.svml === undefined ? undefined : object(parsed.svml, `${subject}.svml`);
  const peerDependenciesMeta = parsed.peerDependenciesMeta === undefined
    ? undefined
    : object(parsed.peerDependenciesMeta, `${subject}.peerDependenciesMeta`);
  return {
    name: string(parsed.name, `${subject}.name`),
    version: string(parsed.version, `${subject}.version`),
    ...(parsed.dependencies === undefined
      ? {}
      : { dependencies: object(parsed.dependencies, `${subject}.dependencies`) as Readonly<Record<string, string>> }),
    ...(parsed.optionalDependencies === undefined
      ? {}
      : { optionalDependencies: object(parsed.optionalDependencies, `${subject}.optionalDependencies`) as Readonly<Record<string, string>> }),
    ...(parsed.peerDependencies === undefined
      ? {}
      : { peerDependencies: object(parsed.peerDependencies, `${subject}.peerDependencies`) as Readonly<Record<string, string>> }),
    ...(peerDependenciesMeta === undefined
      ? {}
      : { peerDependenciesMeta: Object.fromEntries(Object.entries(peerDependenciesMeta).map(([name, raw]) => {
        const value = object(raw, `${subject}.peerDependenciesMeta.${name}`);
        assert(value.optional === undefined || typeof value.optional === "boolean",
          `${subject}.peerDependenciesMeta.${name}.optional must be a boolean`);
        return [name, value.optional === undefined ? {} : { optional: value.optional }];
      })) }),
    ...(svml === undefined ? {} : { svml: {
      ...(svml.activation === undefined
        ? {}
        : { activation: string(svml.activation, `${subject}.svml.activation`) }),
    } }),
  };
}

async function readPackageJson(root: string): Promise<PackageJson> {
  return parsePackageJson(JSON.parse(await readFile(join(root, "package.json"), "utf8")), join(root, "package.json"));
}

async function packageRootFromEntry(entry: string, expectedName: string): Promise<ResolvedPhysicalPackage> {
  let cursor = dirname(await realpath(entry));
  while (true) {
    try {
      const json = await readPackageJson(cursor);
      if (json.name === expectedName) return { root: cursor, json };
    } catch {
      // Keep walking until the package that owns the resolved entry is found.
    }
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`resolved entry for ${expectedName} is outside its package`);
    cursor = parent;
  }
}

async function resolvePhysicalPackage(specifier: string, from: string): Promise<ResolvedPhysicalPackage> {
  const resolver = createRequire(join(resolve(from), "__svml_package_loader__.cjs"));
  let entry: string;
  try {
    entry = resolver.resolve(specifier);
  } catch (entryError) {
    try {
      // Type-only and metadata-only packages may intentionally expose no runtime entry.
      entry = resolver.resolve(`${specifier}/package.json`);
    } catch {
      throw new Error(`cannot resolve installed package ${specifier} from ${from}: ${entryError instanceof Error ? entryError.message : String(entryError)}`);
    }
  }
  return await packageRootFromEntry(entry, specifier);
}

function dependencyNames(json: PackageJson): readonly string[] {
  return [...new Set([
    ...Object.keys(json.dependencies ?? {}),
    ...Object.keys(json.optionalDependencies ?? {}),
    ...Object.keys(json.peerDependencies ?? {}),
  ])].sort();
}

function optionalDependency(json: PackageJson, name: string): boolean {
  return Object.hasOwn(json.optionalDependencies ?? {}, name)
    || json.peerDependenciesMeta?.[name]?.optional === true;
}

async function packageClosure(entries: readonly string[], root: string): Promise<readonly ResolvedPhysicalPackage[]> {
  return await packageClosureFromPhysical(
    await Promise.all(entries.map(async (entry) => await resolvePhysicalPackage(entry, root))),
  );
}

async function packageClosureFromPhysical(
  entries: readonly ResolvedPhysicalPackage[],
): Promise<readonly ResolvedPhysicalPackage[]> {
  return (await packageClosureFromRoots(entries.map((physical, index) => ({
    root: `anonymous:${index}`,
    physical,
  })))).map((item) => item.physical);
}

async function packageClosureFromRoots(
  entries: readonly { readonly root: string; readonly physical: ResolvedPhysicalPackage }[],
): Promise<readonly ReachablePhysicalPackage[]> {
  const resolved = new Map<string, {
    readonly physical: ResolvedPhysicalPackage;
    readonly roots: Set<string>;
  }>();
  const visit = async (item: ResolvedPhysicalPackage, sourceRoot: string): Promise<void> => {
    const key = `${item.json.name}@${item.json.version}`;
    const existing = resolved.get(key);
    if (existing !== undefined) {
      assert(await realpath(existing.physical.root) === await realpath(item.root), `${key} resolves to two physical packages`);
      if (existing.roots.has(sourceRoot)) return;
      existing.roots.add(sourceRoot);
    } else {
      resolved.set(key, { physical: item, roots: new Set([sourceRoot]) });
    }
    for (const dependency of dependencyNames(item.json)) {
      try {
        await visit(await resolvePhysicalPackage(dependency, item.root), sourceRoot);
      } catch (error) {
        if (optionalDependency(item.json, dependency)) continue;
        throw error;
      }
    }
  };
  for (const entry of entries) await visit(entry.physical, entry.root);
  return [...resolved.values()].sort((left, right) =>
    artifactKey(left.physical.json).localeCompare(artifactKey(right.physical.json)),
  );
}

const ALWAYS_IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
const DEVELOPMENT_ROOT_DIRECTORIES = new Set([".cache", "coverage", "test", "tests", "__tests__"]);
const OPERATING_SYSTEM_METADATA_FILES = new Set([".DS_Store"]);

function developmentRootFile(name: string): boolean {
  return /^(?:readme|changelog|license)(?:\..*)?$/iu.test(name)
    || /^(?:tsconfig|vitest)(?:\..*)?\.json$/u.test(name);
}

async function filesUnder(root: string, cursor = root): Promise<readonly string[]> {
  const values: string[] = [];
  for (const entry of await readdir(cursor, { withFileTypes: true })) {
    if (entry.isDirectory() && ALWAYS_IGNORED_DIRECTORIES.has(entry.name)) continue;
    if (cursor === root && entry.isDirectory() && DEVELOPMENT_ROOT_DIRECTORIES.has(entry.name)) continue;
    if (cursor === root && entry.isFile() && developmentRootFile(entry.name)) continue;
    // Finder metadata is not part of a package. Other dotfiles remain package bytes: a package may
    // deliberately read one, so excluding every hidden file would let behavior drift past its lock.
    if (entry.isFile() && OPERATING_SYSTEM_METADATA_FILES.has(entry.name)) continue;
    const path = join(cursor, entry.name);
    if (entry.isDirectory()) values.push(...await filesUnder(root, path));
    else if (entry.isFile()) values.push(path);
    else throw new Error(`package artifact contains unsupported entry ${relative(root, path)}`);
  }
  return values.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

async function artifactDigest(root: string): Promise<LockedPackageArtifact["digest"]> {
  const files = await filesUnder(root);
  const content = [];
  for (const file of files) {
    const bytes = await readFile(file);
    content.push({
      path: relative(root, file).split(sep).join("/"),
      bytes: bytes.byteLength,
      digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    });
  }
  return digestOf({ format: "svml.package-artifact@1", files: content });
}

function activationPath(item: ResolvedPhysicalPackage): string {
  const path = item.json.svml?.activation;
  assert(path !== undefined, `${item.json.name} does not declare svml.activation`);
  assert(!isAbsolute(path), `${item.json.name} activation must be package-relative`);
  const target = resolve(item.root, path);
  const within = relative(item.root, target);
  assert(within !== "" && within !== ".." && !within.startsWith(`..${sep}`), `${item.json.name} activation escapes its package`);
  return target;
}

function contributionMetadata(value: NodePackageContribution): unknown {
  assert(value.format === "svml.node-package@1", "Node package contribution has an unsupported format");
  return {
    format: value.format,
    modules: (value.modules ?? []).map((item) => ({
      manifestDigest: digestOf(item.manifest),
      specifiers: [...(item.specifiers ?? [])].sort(),
    })).sort((left, right) => left.manifestDigest.localeCompare(right.manifestDigest)),
    hostFacets: [...(value.hostFacets ?? [])].map((item) => ({
      abi: item.abi,
      offers: [...(item.offers ?? [])].sort(),
      ...(item.identity === undefined ? {} : { identity: item.identity }),
    })).sort((left, right) => {
      const leftIdentity = "identity" in left ? digestOf(left.identity) : "";
      const rightIdentity = "identity" in right ? digestOf(right.identity) : "";
      return `${left.abi}:${left.offers.join("\u0000")}:${leftIdentity}`
        .localeCompare(`${right.abi}:${right.offers.join("\u0000")}:${rightIdentity}`);
    }),
    components: [...(value.components ?? [])].map((component) => ({
      producers: [...(component.producers ?? [])].map((item) => ({
        producer: item.producer,
        implementationDigest: item.implementationDigest,
      })).sort((left, right) =>
        `${left.producer.module.name}@${left.producer.module.version}#${left.producer.name}`
          .localeCompare(`${right.producer.module.name}@${right.producer.module.version}#${right.producer.name}`),
      ),
      validators: [...(component.validators ?? [])].map((item) => ({
        type: item.type,
        implementationDigest: item.implementationDigest,
      })).sort((left, right) =>
        `${left.type.module.name}@${left.type.module.version}#${left.type.name}`
          .localeCompare(`${right.type.module.name}@${right.type.module.version}#${right.type.name}`),
      ),
    })).sort((left, right) => digestOf(left).localeCompare(digestOf(right))),
  };
}

function addressKey(value: LogicalPackageAddress): string {
  return `${value.abi}\u0000${value.name}`;
}

function contributionOffers(value: NodePackageContribution): readonly LogicalPackageAddress[] {
  const offers = [
    ...(value.modules ?? []).flatMap((item) => [
      `${item.manifest.name}@${item.manifest.version}`,
      ...(item.specifiers ?? []),
    ].map((name) => ({ abi: modulePackageAbi, name }))),
    ...(value.hostFacets ?? []).flatMap((facet) => (facet.offers ?? [])
      .map((name) => ({ abi: facet.abi, name }))),
  ];
  return [...new Map(offers.map((item) => [addressKey(item), item])).values()]
    .sort((left, right) => addressKey(left).localeCompare(addressKey(right)));
}

async function importContribution(item: ResolvedPhysicalPackage): Promise<NodePackageContribution> {
  const target = activationPath(item);
  assert((await stat(target)).isFile(), `${item.json.name} activation is not a file`);
  const imported = await import(pathToFileURL(target).href) as {
    readonly default?: unknown;
  };
  const value = imported.default;
  assert(value !== null && typeof value === "object", `${item.json.name} activation has no default package export`);
  const contribution = value as NodePackageContribution;
  collectNodePackageComponents([contribution]);
  return contribution;
}

function lockContent(lock: Omit<NodePackageLock, "digest">): Omit<NodePackageLock, "digest"> {
  return {
    format: lock.format,
    selected: [...lock.selected].sort(),
    artifacts: [...lock.artifacts].sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
    ),
    packages: [...lock.packages].sort((left, right) => left.package.name.localeCompare(right.package.name)),
  };
}

function sealLock(content: Omit<NodePackageLock, "digest">): NodePackageLock {
  const normalized = lockContent(content);
  return { ...normalized, digest: digestOf(normalized) };
}

function parseLock(value: unknown): NodePackageLock {
  const parsed = object(value, "$lock");
  assert(parsed.format === "svml.node-package-lock@1", "$lock.format must be svml.node-package-lock@1");
  assert(Array.isArray(parsed.selected), "$lock.selected must be an array");
  assert(Array.isArray(parsed.artifacts), "$lock.artifacts must be an array");
  assert(Array.isArray(parsed.packages), "$lock.packages must be an array");
  const selected = parsed.selected.map((raw, index) => string(raw, `$lock.selected[${index}]`));
  assert(new Set(selected).size === selected.length, "$lock.selected repeats a package");
  const artifacts = parsed.artifacts.map((raw, index) => {
    const item = object(raw, `$lock.artifacts[${index}]`);
    const digest = string(item.digest, `$lock.artifacts[${index}].digest`);
    assert(isDigest(digest), `$lock.artifacts[${index}].digest is invalid`);
    return {
      name: string(item.name, `$lock.artifacts[${index}].name`),
      version: string(item.version, `$lock.artifacts[${index}].version`),
      digest,
    };
  });
  const packages = parsed.packages.map((raw, index) => {
    const item = object(raw, `$lock.packages[${index}]`);
    const physical = object(item.package, `$lock.packages[${index}].package`);
    const facetsDigest = string(item.facetsDigest, `$lock.packages[${index}].facetsDigest`);
    assert(isDigest(facetsDigest), `$lock.packages[${index}].facetsDigest is invalid`);
    const closureDigest = string(item.closureDigest, `$lock.packages[${index}].closureDigest`);
    assert(isDigest(closureDigest), `$lock.packages[${index}].closureDigest is invalid`);
    assert(Array.isArray(item.offers), `$lock.packages[${index}].offers must be an array`);
    const offers = item.offers.map((raw, offerIndex) => {
      const offer = object(raw, `$lock.packages[${index}].offers[${offerIndex}]`);
      return {
        abi: string(offer.abi, `$lock.packages[${index}].offers[${offerIndex}].abi`),
        name: string(offer.name, `$lock.packages[${index}].offers[${offerIndex}].name`),
      };
    });
    assert(new Set(offers.map(addressKey)).size === offers.length,
      `$lock.packages[${index}].offers repeats a logical address`);
    return {
      package: {
        name: string(physical.name, `$lock.packages[${index}].package.name`),
        version: string(physical.version, `$lock.packages[${index}].package.version`),
      },
      offers: [...offers].sort((left, right) => addressKey(left).localeCompare(addressKey(right))),
      facetsDigest,
      closureDigest,
    };
  });
  const digest = string(parsed.digest, "$lock.digest");
  assert(isDigest(digest), "$lock.digest is invalid");
  const lock = sealLock({ format: "svml.node-package-lock@1", selected, artifacts, packages });
  assert(lock.digest === digest, "Node package lock digest is invalid");
  return lock;
}

/** Parse and authenticate a lock without resolving or executing its packages. */
export async function readNodePackageLock(path: string): Promise<NodePackageLock> {
  return parseLock(JSON.parse(await readFile(path, "utf8")));
}

async function resolvedArtifacts(closure: readonly ResolvedPhysicalPackage[]): Promise<readonly LockedPackageArtifact[]> {
  return await Promise.all(closure.map(async (item) => ({
    name: item.json.name,
    version: item.json.version,
    digest: await artifactDigest(item.root),
  })));
}

function artifactKey(item: { readonly name: string; readonly version: string }): string {
  return `${item.name}@${item.version}`;
}

/**
 * Select one package closure from a set whose physical bytes were already hashed.
 *
 * A lock load used to call `resolvedArtifacts()` for the complete closure and then
 * call it again for every activated package's dependency closure. Shared packages
 * were therefore read and hashed many times in one command. The complete physical
 * closure has already rejected two locations for the same name/version, so its
 * artifact digest is safe to reuse here without weakening byte verification.
 */
function artifactsForClosure(
  closure: readonly ResolvedPhysicalPackage[],
  verified: ReadonlyMap<string, LockedPackageArtifact>,
): readonly LockedPackageArtifact[] {
  return closure.map((item) => {
    const artifact = verified.get(artifactKey(item.json));
    assert(artifact !== undefined, `verified Artifact for ${artifactKey(item.json)} is missing`);
    return artifact;
  });
}

function sameArtifacts(left: readonly LockedPackageArtifact[], right: readonly LockedPackageArtifact[]): boolean {
  return JSON.stringify([...left].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)))
    === JSON.stringify([...right].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)));
}

export type NodePackageArtifactDifference = {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly string[];
};

export class NodePackageLockStaleError extends Error {
  readonly code = "PACKAGE_LOCK_STALE";
  readonly lock: string;
  readonly packageRoot: string;
  readonly difference: NodePackageArtifactDifference;

  constructor(options: {
    readonly lock: string;
    readonly packageRoot: string;
    readonly difference: NodePackageArtifactDifference;
  }) {
    const lines = [
      `installed Node package bytes do not match the lock: ${options.lock}`,
      ...(options.difference.added.length === 0
        ? [] : [`Added: ${options.difference.added.join(", ")}`]),
      ...(options.difference.removed.length === 0
        ? [] : [`Removed: ${options.difference.removed.join(", ")}`]),
      ...(options.difference.changed.length === 0
        ? [] : [`Changed: ${options.difference.changed.join(", ")}`]),
      "Review and accept these installed bytes explicitly with:",
      `  narratage lock-packages ${options.lock} --refresh --package-root ${options.packageRoot}`,
      "For a project, prefer `narratage packages sync <run-source> --runtime <profile>` to derive both locks.",
    ];
    super(lines.join("\n"));
    this.name = "NodePackageLockStaleError";
    this.lock = options.lock;
    this.packageRoot = options.packageRoot;
    this.difference = options.difference;
  }
}

function artifactDifference(
  installed: readonly LockedPackageArtifact[],
  locked: readonly LockedPackageArtifact[],
): NodePackageArtifactDifference {
  const current = new Map(installed.map((item) => [artifactKey(item), item.digest]));
  const expected = new Map(locked.map((item) => [artifactKey(item), item.digest]));
  return {
    added: [...current.keys()].filter((key) => !expected.has(key)).sort(),
    removed: [...expected.keys()].filter((key) => !current.has(key)).sort(),
    changed: [...current.entries()]
      .filter(([key, digest]) => expected.has(key) && expected.get(key) !== digest)
      .map(([key]) => key)
      .sort(),
  };
}

/** The explicit trust action may inspect activation metadata inside the selected physical closure. */
export async function createNodePackageLock(
  specifiers: readonly string[],
  root: string,
  options: NodePackageLockCreateOptions = {},
): Promise<NodePackageLock> {
  return (await createNodePackageSet(specifiers, root, options)).lock;
}

/** Trust selected physical roots and return the exact executable inventory assembled from them. */
export async function createNodePackageInventory(
  specifiers: readonly string[],
  root: string,
  options: NodePackageLockCreateOptions = {},
): Promise<LoadedNodePackageSet> {
  return await createNodePackageSet(specifiers, root, options);
}

async function createNodePackageSet(
  specifiers: readonly string[],
  root: string,
  options: NodePackageLockCreateOptions = {},
  inventory?: { readonly path: string; readonly lock: NodePackageLock },
): Promise<LoadedNodePackageSet> {
  const unique = [...new Set(specifiers)].sort();
  const selectedPhysical = await Promise.all(unique.map(async (specifier) => ({
    root: specifier,
    physical: await resolvePhysicalPackage(specifier, root),
  })));
  const reachable = await packageClosureFromRoots(selectedPhysical);
  const closure = reachable.map((item) => item.physical);

  // Hash this candidate physical closure once, before any activation code executes. A selection
  // mutation may admit new roots, but every package still reachable from a retained root must be
  // byte-identical to the old authenticated lock.
  const artifacts = await resolvedArtifacts(closure);
  const artifactsByPackage = new Map(artifacts.map((item) => [artifactKey(item), item]));
  if (inventory !== undefined) {
    const trusted = new Map(inventory.lock.artifacts.map((item) => [artifactKey(item), item.digest]));
    const untrusted = artifacts.filter((item) => trusted.get(artifactKey(item)) !== item.digest);
    if (untrusted.length > 0) {
      throw new NodePackageLockStaleError({
        lock: inventory.path,
        packageRoot: resolve(root),
        difference: {
          added: untrusted.filter((item) => !trusted.has(artifactKey(item))).map(artifactKey).sort(),
          removed: [],
          changed: untrusted.filter((item) => trusted.has(artifactKey(item))).map(artifactKey).sort(),
        },
      });
    }
  }
  if (options.retain !== undefined) {
    const oldSelected = new Set(options.retain.from.selected);
    const newSelected = new Set(unique);
    const retained = new Set(options.retain.selected);
    for (const specifier of retained) {
      assert(oldSelected.has(specifier), `${specifier} is not a selected root in the existing package lock`);
      assert(newSelected.has(specifier), `${specifier} is not retained by the new package selection`);
    }
    const locked = new Map(options.retain.from.artifacts.map((artifact) => [artifactKey(artifact), artifact.digest]));
    for (const item of reachable) {
      if (![...item.roots].some((specifier) => retained.has(specifier))) continue;
      const artifact = artifactsByPackage.get(artifactKey(item.physical.json))!;
      const expected = locked.get(artifactKey(item.physical.json));
      assert(expected !== undefined,
        `retained package closure introduced ${artifactKey(item.physical.json)}; use --refresh or an exact --package selection`);
      assert(expected === artifact.digest,
        `retained package bytes changed for ${artifactKey(item.physical.json)}; use --refresh or an exact --package selection`);
    }
  }

  const candidates = new Map<string, {
    readonly physical: ResolvedPhysicalPackage;
    readonly contribution: NodePackageContribution;
  }>();
  for (const physical of closure) {
    if (physical.json.svml?.activation === undefined) continue;
    candidates.set(`${physical.json.name}@${physical.json.version}`, {
      physical,
      contribution: await importContribution(physical),
    });
  }

  const selectedKeys = new Set(selectedPhysical.map((item) => artifactKey(item.physical.json)));
  const activated = new Map<string, {
    readonly physical: ResolvedPhysicalPackage;
    readonly contribution: NodePackageContribution;
  }>();
  for (const key of selectedKeys) {
    const candidate = candidates.get(key);
    assert(candidate !== undefined, `${key} does not declare svml.activation`);
    activated.set(key, candidate);
  }

  const moduleKey = (name: string, version: string): string => `${name}@${version}`;
  const required = new Map<string, string>();
  const visitContribution = (candidate: {
    readonly physical: ResolvedPhysicalPackage;
    readonly contribution: NodePackageContribution;
  }): void => {
    for (const module of candidate.contribution.modules ?? []) {
      for (const dependency of module.manifest.dependencies) {
        const key = moduleKey(dependency.module.name, dependency.module.version);
        const existing = required.get(key);
        assert(existing === undefined || existing === dependency.digest,
          `Module dependency ${key} is required with two different digests`);
        required.set(key, dependency.digest);
      }
    }
  };
  for (const candidate of activated.values()) visitContribution(candidate);

  const satisfied = (): Map<string, string> => {
    const modules = new Map<string, string>();
    for (const candidate of activated.values()) {
      for (const module of candidate.contribution.modules ?? []) {
        const key = moduleKey(module.manifest.name, module.manifest.version);
        const digest = digestOf(module.manifest);
        const existing = modules.get(key);
        assert(existing === undefined || existing === digest,
          `activated packages repeat Module ${key} with different digests`);
        modules.set(key, digest);
      }
    }
    return modules;
  };

  while (true) {
    const modules = satisfied();
    const unresolved = [...required.entries()].find(([key, digest]) => modules.get(key) !== digest);
    if (unresolved === undefined) break;
    const [key, digest] = unresolved;
    const providers = [...candidates.values()].filter((candidate) =>
      (candidate.contribution.modules ?? []).some((module) =>
        moduleKey(module.manifest.name, module.manifest.version) === key
          && digestOf(module.manifest) === digest),
    );
    assert(providers.length > 0,
      `no installed package in the selected physical closure provides required Module ${key} (${digest})`);
    assert(providers.length === 1,
      `multiple installed packages in the selected physical closure provide required Module ${key} (${digest})`);
    const provider = providers[0]!;
    const providerKey = `${provider.physical.json.name}@${provider.physical.json.version}`;
    assert(!activated.has(providerKey), `Module dependency ${key} cannot be resolved`);
    activated.set(providerKey, provider);
    visitContribution(provider);
  }
  collectNodePackageComponents([...activated.values()].map((item) => item.contribution));

  const packages: LockedNodePackage[] = [];
  for (const { physical, contribution } of activated.values()) {
    const ownArtifacts = artifactsForClosure(
      await packageClosureFromPhysical([physical]),
      artifactsByPackage,
    );
    packages.push({
      package: { name: physical.json.name, version: physical.json.version },
      offers: contributionOffers(contribution),
      facetsDigest: digestOf(contributionMetadata(contribution)),
      closureDigest: digestOf({ format: "svml.package-closure@1", artifacts: ownArtifacts }),
    });
  }
  const lock = sealLock({
    format: "svml.node-package-lock@1",
    selected: unique,
    artifacts,
    packages,
  });
  if (inventory !== undefined) {
    const trusted = new Map(inventory.lock.packages.map((item) => [item.package.name, item]));
    for (const item of lock.packages) {
      const expected = trusted.get(item.package.name);
      assert(expected !== undefined, `${item.package.name} is absent from package inventory ${inventory.path}`);
      assert(JSON.stringify(expected) === JSON.stringify(item),
        `${item.package.name} activation differs from package inventory ${inventory.path}`);
    }
  }
  return {
    lock,
    inventoryDigest: inventory?.lock.digest ?? lock.digest,
    packages: [...activated.values()].map((item) => ({
      specifier: item.physical.json.name,
      contribution: item.contribution,
    })),
  };
}

export async function writeNodePackageLock(path: string, lock: NodePackageLock): Promise<void> {
  const target = resolve(path);
  const temporary = join(dirname(target), `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx");
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** Verify every selected physical artifact before executing any package activation code. */
export async function loadNodePackageSet(
  path: string,
  root = dirname(resolve(path)),
): Promise<LoadedNodePackageSet> {
  const lockPath = resolve(path);
  const packageRoot = resolve(root);
  const lock = await readNodePackageLock(lockPath);
  const closure = await packageClosure(lock.selected, packageRoot);
  const artifacts = await resolvedArtifacts(closure);
  if (!sameArtifacts(artifacts, lock.artifacts)) {
    throw new NodePackageLockStaleError({
      lock: lockPath,
      packageRoot,
      difference: artifactDifference(artifacts, lock.artifacts),
    });
  }
  const artifactsByPackage = new Map(artifacts.map((item) => [artifactKey(item), item]));
  const byName = new Map(closure.map((item) => [`${item.json.name}@${item.json.version}`, item]));
  const values: NodePackageBinding[] = [];
  for (const expected of lock.packages) {
    const physical = byName.get(`${expected.package.name}@${expected.package.version}`);
    assert(physical !== undefined, `${expected.package.name}@${expected.package.version} is not installed`);
    const contribution = await importContribution(physical);
    assert(digestOf(contributionMetadata(contribution)) === expected.facetsDigest,
      `${expected.package.name} facets do not match the lock`);
    const ownArtifacts = artifactsForClosure(
      await packageClosureFromPhysical([physical]),
      artifactsByPackage,
    );
    assert(digestOf({ format: "svml.package-closure@1", artifacts: ownArtifacts }) === expected.closureDigest,
      `${expected.package.name} dependency closure does not match the lock`);
    values.push({ specifier: expected.package.name, contribution });
  }
  collectNodePackageComponents(values.map((item) => item.contribution));
  return { lock, inventoryDigest: lock.digest, packages: values };
}

function selectedNodePackageSpecifiers(
  inventory: NodePackageLock,
  request: readonly string[] | NodePackageSelectionRequest,
  subject: string,
): readonly string[] {
  const requested: NodePackageSelectionRequest = Array.isArray(request)
    ? { selected: request }
    : request as NodePackageSelectionRequest;
  const logical = new Map((requested.logical ?? []).map((item) => [addressKey(item), item]));
  // Physical spellings are enrollment hints only. Once a Source has logical addresses, the
  // authenticated inventory binding is the sole authority for exact compilation selection.
  const selected = new Set(logical.size === 0 ? requested.selected : []);
  for (const address of logical.values()) {
    const providers = inventory.packages.filter((item) =>
      item.offers.some((offer) => addressKey(offer) === addressKey(address)));
    assert(providers.length > 0, [
      `${subject} does not provide this Source language selection:`,
      `  ${address.abi} ${address.name}`,
    ].join("\n"));
    assert(providers.length === 1, [
      `${subject} ambiguously provides this Source language selection:`,
      `  ${address.abi} ${address.name}`,
      ...providers.map((item) => `  ${item.package.name}`),
    ].join("\n"));
    selected.add(providers[0]!.package.name);
  }
  const available = new Set(inventory.selected);
  const missing = [...selected].filter((item) => !available.has(item)).sort();
  assert(missing.length === 0, [
    `${subject} does not authorize this physical selection:`,
    ...missing.map((item) => `  ${item}`),
  ].join("\n"));
  return [...selected].sort();
}

/** Resolve one logical Source selection against authenticated inventory metadata without execution. */
export function selectNodePackageSpecifiers(
  inventory: NodePackageLock,
  request: readonly string[] | NodePackageSelectionRequest,
): readonly string[] {
  return selectedNodePackageSpecifiers(inventory, request, `package inventory ${inventory.digest}`);
}

/**
 * Activate only the exact roots required by one compilation from a trusted package inventory.
 * Unrelated inventory entries are neither verified nor executed by this invocation.
 */
export async function loadNodePackageSelection(
  path: string,
  request: readonly string[] | NodePackageSelectionRequest,
  root = dirname(resolve(path)),
): Promise<LoadedNodePackageSet> {
  const lockPath = resolve(path);
  const inventory = await readNodePackageLock(lockPath);
  const selected = selectedNodePackageSpecifiers(inventory, request, `package inventory ${lockPath}`);
  return await createNodePackageSet(selected, resolve(root), {}, { path: lockPath, lock: inventory });
}

export async function loadNodePackageContributions(
  path: string,
  root = dirname(resolve(path)),
): Promise<readonly NodePackageContribution[]> {
  return (await loadNodePackageSet(path, root)).packages.map((item) => item.contribution);
}
