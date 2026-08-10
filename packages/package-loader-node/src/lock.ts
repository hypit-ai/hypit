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

import { digestOf, isDigest } from "@narratage/protocol";

import { collectNodePackageComponents } from "./contribution.js";
import type {
  LockedNodePackage,
  LockedPackageArtifact,
  LoadedNodePackageSet,
  NodePackageContribution,
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
        if (optionalDependency(item.json, dependency)) continue;
        throw error;
      }
    }
  };
  for (const entry of entries) await visit(entry);
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
  assert(value.name.trim().length > 0, "Node package contribution name is empty");
  return {
    format: value.format,
    name: value.name,
    modules: (value.modules ?? []).map((item) => ({
      manifestDigest: digestOf(item.manifest),
      specifiers: [...(item.specifiers ?? [])].sort(),
    })).sort((left, right) => left.manifestDigest.localeCompare(right.manifestDigest)),
    authorFrontends: [...(value.authorFrontends ?? [])].map((item) => ({
      id: item.id,
      implementationDigest: item.implementationDigest,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    runFrontends: [...(value.runFrontends ?? [])].map((item) => ({
      id: item.id,
      implementationDigest: item.implementationDigest,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    hostFacets: [...(value.hostFacets ?? [])].map((item) => ({
      abi: item.abi,
      identity: item.identity,
    })).sort((left, right) =>
      `${left.abi}:${digestOf(left.identity)}`.localeCompare(`${right.abi}:${digestOf(right.identity)}`),
    ),
    components: [...(value.components ?? [])].map((component) => ({
      name: component.name,
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
    })).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

async function importContribution(item: ResolvedPhysicalPackage): Promise<NodePackageContribution> {
  const target = activationPath(item);
  assert((await stat(target)).isFile(), `${item.json.name} activation is not a file`);
  const imported = await import(pathToFileURL(target).href) as {
    readonly default?: unknown;
    readonly svmlPackage?: unknown;
  };
  const value = imported.default ?? imported.svmlPackage;
  assert(value !== null && typeof value === "object", `${item.json.name} activation exports no package`);
  const contribution = value as NodePackageContribution;
  assert(contribution.name === item.json.name,
    `${item.json.name} activation claims physical package ${contribution.name}`);
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
    packages: [...lock.packages].sort((left, right) => left.specifier.localeCompare(right.specifier)),
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
    return {
      specifier: string(item.specifier, `$lock.packages[${index}].specifier`),
      package: {
        name: string(physical.name, `$lock.packages[${index}].package.name`),
        version: string(physical.version, `$lock.packages[${index}].package.version`),
      },
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

/** The explicit trust action may inspect activation metadata inside the selected physical closure. */
export async function createNodePackageLock(
  specifiers: readonly string[],
  root: string,
): Promise<NodePackageLock> {
  const unique = [...new Set(specifiers)].sort();
  assert(unique.length > 0, "at least one Node package is required");
  const selectedPhysical = await Promise.all(unique.map(async (specifier) =>
    await resolvePhysicalPackage(specifier, root)));
  const closure = await packageClosureFromPhysical(selectedPhysical);
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

  const selectedKeys = new Set(selectedPhysical.map((item) => `${item.json.name}@${item.json.version}`));
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
    const ownArtifacts = await resolvedArtifacts(await packageClosureFromPhysical([physical]));
    packages.push({
      specifier: physical.json.name,
      package: { name: physical.json.name, version: physical.json.version },
      facetsDigest: digestOf(contributionMetadata(contribution)),
      closureDigest: digestOf({ format: "svml.package-closure@1", artifacts: ownArtifacts }),
    });
  }
  return sealLock({
    format: "svml.node-package-lock@1",
    selected: unique,
    artifacts: await resolvedArtifacts(closure),
    packages,
  });
}

export async function writeNodePackageLock(path: string, lock: NodePackageLock): Promise<void> {
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "w" });
}

/** Verify every selected physical artifact before executing any package activation code. */
export async function loadNodePackageSet(
  path: string,
  root = dirname(resolve(path)),
): Promise<LoadedNodePackageSet> {
  const lock = parseLock(JSON.parse(await readFile(path, "utf8")));
  const closure = await packageClosure(lock.selected, root);
  const artifacts = await resolvedArtifacts(closure);
  assert(sameArtifacts(artifacts, lock.artifacts), "installed Node package bytes do not match the lock");
  const byName = new Map(closure.map((item) => [`${item.json.name}@${item.json.version}`, item]));
  const values: NodePackageContribution[] = [];
  for (const expected of lock.packages) {
    const physical = byName.get(`${expected.package.name}@${expected.package.version}`);
    assert(physical !== undefined, `${expected.package.name}@${expected.package.version} is not installed`);
    assert(physical.json.name === expected.specifier, `${expected.specifier} identifies another package`);
    const contribution = await importContribution(physical);
    assert(digestOf(contributionMetadata(contribution)) === expected.facetsDigest,
      `${expected.specifier} facets do not match the lock`);
    const ownArtifacts = await resolvedArtifacts(await packageClosureFromPhysical([physical]));
    assert(digestOf({ format: "svml.package-closure@1", artifacts: ownArtifacts }) === expected.closureDigest,
      `${expected.specifier} dependency closure does not match the lock`);
    values.push(contribution);
  }
  collectNodePackageComponents(values);
  return { lock, contributions: values };
}

export async function loadNodePackageContributions(
  path: string,
  root = dirname(resolve(path)),
): Promise<readonly NodePackageContribution[]> {
  return (await loadNodePackageSet(path, root)).contributions;
}
