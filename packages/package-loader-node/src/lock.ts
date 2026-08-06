import { createHash } from "node:crypto";
import {
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

import { digestOf, isDigest } from "@svml/protocol";

import type {
  LockedAuthorPackage,
  LockedPackageArtifact,
  NodeAuthorPackage,
  NodeAuthorPackageLock,
} from "./types.js";

type PackageJson = {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly svml?: {
    readonly authorActivation?: string;
  };
};

type ResolvedPhysicalPackage = {
  readonly root: string;
  readonly json: PackageJson;
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
    ...(svml?.authorActivation === undefined
      ? {}
      : { svml: { authorActivation: string(svml.authorActivation, `${subject}.svml.authorActivation`) } }),
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
  } catch (error) {
    throw new Error(`cannot resolve installed package ${specifier} from ${from}: ${error instanceof Error ? error.message : String(error)}`);
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

async function packageClosure(entries: readonly string[], root: string): Promise<readonly ResolvedPhysicalPackage[]> {
  const resolved = new Map<string, ResolvedPhysicalPackage>();
  const visit = async (item: ResolvedPhysicalPackage): Promise<void> => {
    const key = `${item.json.name}@${item.json.version}`;
    const existing = resolved.get(key);
    if (existing !== undefined) {
      assert(await realpath(existing.root) === await realpath(item.root), `${key} resolves to two physical packages`);
      return;
    }
    resolved.set(key, item);
    for (const dependency of dependencyNames(item.json)) {
      try {
        await visit(await resolvePhysicalPackage(dependency, item.root));
      } catch (error) {
        if (Object.hasOwn(item.json.optionalDependencies ?? {}, dependency)) continue;
        throw error;
      }
    }
  };
  for (const entry of entries) await visit(await resolvePhysicalPackage(entry, root));
  return [...resolved.values()].sort((left, right) =>
    `${left.json.name}@${left.json.version}`.localeCompare(`${right.json.name}@${right.json.version}`),
  );
}

async function filesUnder(root: string, cursor = root): Promise<readonly string[]> {
  const values: string[] = [];
  for (const entry of await readdir(cursor, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
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
  const path = item.json.svml?.authorActivation;
  assert(path !== undefined, `${item.json.name} does not declare svml.authorActivation`);
  assert(!isAbsolute(path), `${item.json.name} authorActivation must be package-relative`);
  const target = resolve(item.root, path);
  const within = relative(item.root, target);
  assert(within !== "" && within !== ".." && !within.startsWith(`..${sep}`), `${item.json.name} authorActivation escapes its package`);
  return target;
}

function activationMetadata(value: NodeAuthorPackage): unknown {
  assert(value.format === "svml.node-author-package@1", "author activation has an unsupported format");
  assert(value.name.trim().length > 0, "author activation name is empty");
  return {
    format: value.format,
    name: value.name,
    modules: value.modules.map((item) => ({
      manifestDigest: digestOf(item.manifest),
      specifiers: [...(item.specifiers ?? [])].sort(),
    })).sort((left, right) => left.manifestDigest.localeCompare(right.manifestDigest)),
    frontends: [...(value.frontends ?? [])].map((item) => ({
      id: item.id,
      implementationDigest: item.implementationDigest,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    textSurfaces: [...(value.textSurfaces ?? [])].map((item) => ({
      module: item.module,
      surface: item.surface,
      mode: item.mode,
      implementationDigest: item.implementationDigest,
    })).sort((left, right) =>
      `${left.module.name}@${left.module.version}#${left.surface}`
        .localeCompare(`${right.module.name}@${right.module.version}#${right.surface}`),
    ),
  };
}

async function importActivation(item: ResolvedPhysicalPackage): Promise<NodeAuthorPackage> {
  const target = activationPath(item);
  assert((await stat(target)).isFile(), `${item.json.name} authorActivation is not a file`);
  const imported = await import(pathToFileURL(target).href) as {
    readonly default?: unknown;
    readonly svmlAuthorPackage?: unknown;
  };
  const value = imported.default ?? imported.svmlAuthorPackage;
  assert(value !== null && typeof value === "object", `${item.json.name} authorActivation exports no package`);
  const activation = value as NodeAuthorPackage;
  assert(activation.name === item.json.name,
    `${item.json.name} authorActivation claims physical package ${activation.name}`);
  return activation;
}

function lockContent(lock: Omit<NodeAuthorPackageLock, "digest">): Omit<NodeAuthorPackageLock, "digest"> {
  return {
    format: lock.format,
    artifacts: [...lock.artifacts].sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
    ),
    packages: [...lock.packages].sort((left, right) => left.specifier.localeCompare(right.specifier)),
  };
}

function sealLock(content: Omit<NodeAuthorPackageLock, "digest">): NodeAuthorPackageLock {
  const normalized = lockContent(content);
  return { ...normalized, digest: digestOf(normalized) };
}

function parseLock(value: unknown): NodeAuthorPackageLock {
  const parsed = object(value, "$lock");
  assert(parsed.format === "svml.node-author-lock@1", "$lock.format must be svml.node-author-lock@1");
  assert(Array.isArray(parsed.artifacts), "$lock.artifacts must be an array");
  assert(Array.isArray(parsed.packages), "$lock.packages must be an array");
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
    return {
      specifier: string(item.specifier, `$lock.packages[${index}].specifier`),
      package: {
        name: string(physical.name, `$lock.packages[${index}].package.name`),
        version: string(physical.version, `$lock.packages[${index}].package.version`),
      },
      facetsDigest,
    };
  });
  const digest = string(parsed.digest, "$lock.digest");
  assert(isDigest(digest), "$lock.digest is invalid");
  const lock = sealLock({ format: "svml.node-author-lock@1", artifacts, packages });
  assert(lock.digest === digest, "Node author package lock digest is invalid");
  return lock;
}

async function resolvedArtifacts(closure: readonly ResolvedPhysicalPackage[]): Promise<readonly LockedPackageArtifact[]> {
  return await Promise.all(closure.map(async (item) => ({
    name: item.json.name,
    version: item.json.version,
    digest: await artifactDigest(item.root),
  })));
}

function sameArtifacts(left: readonly LockedPackageArtifact[], right: readonly LockedPackageArtifact[]): boolean {
  return JSON.stringify([...left].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)))
    === JSON.stringify([...right].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)));
}

/** Lock creation is the explicit trust action and therefore may inspect the selected package exports. */
export async function createNodeAuthorPackageLock(
  specifiers: readonly string[],
  root: string,
): Promise<NodeAuthorPackageLock> {
  const unique = [...new Set(specifiers)].sort();
  assert(unique.length > 0, "at least one author package is required");
  const closure = await packageClosure(unique, root);
  const packages: LockedAuthorPackage[] = [];
  for (const specifier of unique) {
    const physical = await resolvePhysicalPackage(specifier, root);
    const activation = await importActivation(physical);
    packages.push({
      specifier,
      package: { name: physical.json.name, version: physical.json.version },
      facetsDigest: digestOf(activationMetadata(activation)),
    });
  }
  return sealLock({
    format: "svml.node-author-lock@1",
    artifacts: await resolvedArtifacts(closure),
    packages,
  });
}

export async function writeNodeAuthorPackageLock(path: string, lock: NodeAuthorPackageLock): Promise<void> {
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "w" });
}

/** Verify every selected physical artifact before executing any package activation code. */
export async function loadNodeAuthorPackages(
  path: string,
  root = dirname(resolve(path)),
): Promise<readonly NodeAuthorPackage[]> {
  const lock = parseLock(JSON.parse(await readFile(path, "utf8")));
  const specifiers = lock.packages.map((item) => item.specifier);
  const closure = await packageClosure(specifiers, root);
  const artifacts = await resolvedArtifacts(closure);
  assert(sameArtifacts(artifacts, lock.artifacts), "installed author package bytes do not match the lock");
  const byName = new Map(closure.map((item) => [`${item.json.name}@${item.json.version}`, item]));
  const values: NodeAuthorPackage[] = [];
  for (const expected of lock.packages) {
    const physical = byName.get(`${expected.package.name}@${expected.package.version}`);
    assert(physical !== undefined, `${expected.package.name}@${expected.package.version} is not installed`);
    assert(physical.json.name === expected.specifier, `${expected.specifier} resolved to another package`);
    const activation = await importActivation(physical);
    assert(digestOf(activationMetadata(activation)) === expected.facetsDigest,
      `${expected.specifier} author facets do not match the lock`);
    values.push(activation);
  }
  return values;
}
