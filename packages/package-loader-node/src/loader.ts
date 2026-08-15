import { readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { modulePackageAbi } from "@narratage/protocol";

import type {
  LoadedPackage,
  LogicalPackageAddress,
  NodePackageContribution,
  NodePackageSelectionRequest,
} from "./types.js";

type PackageJson = {
  readonly name: string;
  readonly version: string;
  readonly narratage?: { readonly activation?: string };
};

type ResolvedPackage = { readonly root: string; readonly json: PackageJson };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, subject: string): string {
  assert(typeof value === "string" && value.length > 0, `${subject} must be a non-empty string`);
  return value;
}

function parsePackageJson(value: unknown, subject: string): PackageJson {
  const item = object(value, subject);
  const narratage = item.narratage === undefined ? undefined : object(item.narratage, `${subject}.narratage`);
  return {
    name: text(item.name, `${subject}.name`),
    version: text(item.version, `${subject}.version`),
    ...(narratage?.activation === undefined ? {} : { narratage: { activation: text(narratage.activation, `${subject}.narratage.activation`) } }),
  };
}

async function packageJson(root: string): Promise<PackageJson> {
  const path = join(root, "package.json");
  return parsePackageJson(JSON.parse(await readFile(path, "utf8")), path);
}

async function packageRoot(entry: string, expectedName: string): Promise<ResolvedPackage> {
  let cursor = dirname(await realpath(entry));
  while (true) {
    try {
      const json = await packageJson(cursor);
      if (json.name === expectedName) return { root: cursor, json };
    } catch {
      // Continue to the package that owns the resolved entry.
    }
    const parent = dirname(cursor);
    if (parent === cursor) throw new Error(`resolved entry for ${expectedName} is outside its package`);
    cursor = parent;
  }
}

async function resolvePackage(specifier: string, from: string): Promise<ResolvedPackage> {
  const resolver = createRequire(join(resolve(from), "__narratage_package_loader__.cjs"));
  try {
    return await packageRoot(resolver.resolve(specifier), specifier);
  } catch (entryError) {
    try {
      return await packageRoot(resolver.resolve(`${specifier}/package.json`), specifier);
    } catch {
      throw new Error(`cannot resolve installed package ${specifier} from ${from}: ${entryError instanceof Error ? entryError.message : String(entryError)}`);
    }
  }
}

function activationPath(item: ResolvedPackage): string {
  const declared = item.json.narratage?.activation;
  assert(declared !== undefined, `${item.json.name} does not declare narratage.activation`);
  assert(!isAbsolute(declared), `${item.json.name} activation must be package-relative`);
  const target = resolve(item.root, declared);
  const relation = relative(item.root, target);
  assert(relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`), `${item.json.name} activation escapes its package`);
  return target;
}

async function importContribution(item: ResolvedPackage): Promise<NodePackageContribution> {
  const target = activationPath(item);
  assert((await stat(target)).isFile(), `${item.json.name} activation is not a file`);
  const imported = await import(pathToFileURL(target).href) as { readonly default?: unknown };
  assert(imported.default !== null && typeof imported.default === "object", `${item.json.name} activation has no default package export`);
  const contribution = imported.default as Partial<NodePackageContribution>;
  assert(contribution.format === "narratage.node-package@1", `${item.json.name} activation has an unsupported package format`);
  return contribution as NodePackageContribution;
}

function addressKey(value: LogicalPackageAddress): string {
  return `${value.abi}\u0000${value.name}`;
}

function offers(value: NodePackageContribution): readonly LogicalPackageAddress[] {
  return [
    ...(value.modules ?? []).flatMap((item) => [
      `${item.manifest.name}@${item.manifest.version}`,
      ...(item.specifiers ?? []),
    ].map((name) => ({ abi: modulePackageAbi, name }))),
    ...(value.hostFacets ?? []).flatMap((facet) => (facet.offers ?? []).map((name) => ({ abi: facet.abi, name }))),
  ];
}

/** Conventional physical package spelling for a logical @scope/name@version address. */
function physicalHint(logical: string): string {
  const slash = logical.startsWith("@") ? logical.indexOf("/", 1) : -1;
  const version = logical.lastIndexOf("@");
  const unversioned = version > Math.max(slash, 0) ? logical.slice(0, version) : logical;
  if (!unversioned.startsWith("@")) return unversioned.split("/", 1)[0]!;
  const packageSlash = unversioned.indexOf("/", 1);
  const subpath = unversioned.indexOf("/", packageSlash + 1);
  return subpath < 0 ? unversioned : unversioned.slice(0, subpath);
}

export class NodePackageSelectionMissingError extends Error {
  readonly code = "PACKAGE_SELECTION_MISSING";
  constructor(readonly address: LogicalPackageAddress) {
    super(`installed packages do not provide ${address.abi} ${address.name}`);
    this.name = "NodePackageSelectionMissingError";
  }
}

/**
 * Load the packages explicitly named by Source discovery or a Runtime Profile.
 * Node's package manager owns installed versions and bytes; Narratage validates only the
 * contribution boundary it consumes.
 */
export async function loadNodePackageSelection(
  request: readonly string[] | NodePackageSelectionRequest,
  root: string,
): Promise<readonly LoadedPackage[]> {
  const normalized: NodePackageSelectionRequest = Array.isArray(request)
    ? { selected: request }
    : request as NodePackageSelectionRequest;
  const selected = new Set(normalized.selected);
  for (const address of normalized.logical ?? []) selected.add(physicalHint(address.name));
  if (selected.size === 0) return [];

  const roots = await Promise.all([...selected].sort().map(async (name) => await resolvePackage(name, root)));
  type ActivatedPackage = { readonly physical: ResolvedPackage; readonly contribution: NodePackageContribution };
  const activated = new Map<string, ActivatedPackage>();
  for (const item of await Promise.all(roots.map(async (physical) => ({
    physical,
    contribution: await importContribution(physical),
  })))) {
    activated.set(item.physical.json.name, item);
  }
  for (const address of normalized.logical ?? []) {
    const providers = [...activated.values()].filter((item) => offers(item.contribution)
      .some((offer) => addressKey(offer) === addressKey(address)));
    if (providers.length === 0) throw new NodePackageSelectionMissingError(address);
    assert(providers.length === 1, `${address.abi} ${address.name} is provided by more than one selected package`);
  }

  const moduleKey = (name: string, version: string) => `${name}@${version}`;
  while (true) {
    const provided = new Set<string>();
    const required = new Map<string, { readonly from: string }>();
    for (const item of activated.values()) {
      for (const module of item.contribution.modules ?? []) {
        provided.add(moduleKey(module.manifest.name, module.manifest.version));
        for (const dependency of module.manifest.dependencies) {
          required.set(moduleKey(dependency.module.name, dependency.module.version), {
            from: item.physical.root,
          });
        }
      }
    }
    const missing = [...required].filter(([key]) => !provided.has(key));
    if (missing.length === 0) break;
    const additions = await Promise.all(missing.map(async ([key, requirement]) => {
      const providerPackage = physicalHint(key);
      assert(!activated.has(providerPackage), `selected package ${providerPackage} provides the wrong ${key}`);
      const physical = await resolvePackage(providerPackage, requirement.from);
      const provider = { physical, contribution: await importContribution(physical) };
      const offered = (provider.contribution.modules ?? []).some((module) =>
        moduleKey(module.manifest.name, module.manifest.version) === key);
      assert(offered, `${providerPackage} does not provide the required ${key}`);
      return provider;
    }));
    for (const provider of additions) activated.set(provider.physical.json.name, provider);
  }

  const packages: LoadedPackage[] = [...activated.values()]
    .sort((left, right) => left.physical.json.name.localeCompare(right.physical.json.name))
    .map((item) => ({
      specifier: item.physical.json.name,
      contribution: item.contribution,
    }));
  return packages;
}
