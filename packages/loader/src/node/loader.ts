import { readFile, realpath, stat } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { moduleKey, modulePackageAbi } from "@hypit/protocol";
import { verifyPackageContributions } from "../contribution.js";

import type {
  LoadedPackage,
  LogicalPackageAddress,
  PackageContribution,
} from "../types.js";
import type { NodePackageLoadOptions, NodePackageSelectionRequest } from "./types.js";
import { embeddedPackageDirectory, distributionPackageRoots, locateNodePackage } from "./location.js";

type PackageJson = {
  readonly name: string;
  readonly version?: string;
  readonly hypit?: { readonly activation?: string };
  readonly dependencies: Readonly<Record<string, string>>;
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
  const hypit = item.hypit === undefined ? undefined : object(item.hypit, `${subject}.hypit`);
  const dependencies = item.dependencies === undefined ? {} : object(item.dependencies, `${subject}.dependencies`);
  return {
    name: text(item.name, `${subject}.name`),
    ...(item.version === undefined ? {} : { version: text(item.version, `${subject}.version`) }),
    ...(hypit?.activation === undefined ? {} : { hypit: {
      activation: text(hypit.activation, `${subject}.hypit.activation`),
    } }),
    dependencies: Object.fromEntries(Object.entries(dependencies).map(([name, version]) => [
      name,
      text(version, `${subject}.dependencies.${name}`),
    ])),
  };
}

async function packageJson(root: string): Promise<PackageJson> {
  const path = join(root, "package.json");
  return parsePackageJson(JSON.parse(await readFile(path, "utf8")), path);
}

async function resolvePackage(specifier: string, roots: readonly string[]): Promise<ResolvedPackage> {
  let failure: unknown;
  for (const from of roots) {
    try {
      const located = locateNodePackage(specifier, {
        from: join(resolve(from), "__hypit_package_loader__.mjs"),
        workspaceRoots: [from],
        distributionRoots: [],
      });
      return { root: located.root, json: await packageJson(located.root) };
    } catch (error) {
      failure = error;
    }
  }
  throw new Error(`cannot resolve installed package ${specifier} from ${roots.join(", ")}: ${failure instanceof Error ? failure.message : String(failure)}`);
}

function resolutionRoots(
  specifier: string,
  projectRoots: readonly string[],
  distributionRoots: readonly string[],
): readonly string[] {
  // Protect only exact packages physically embedded by the active Distribution. Its ordinary npm
  // dependencies are independently versioned extensions, so an explicit project install wins.
  return distributionRoots.some((root) => embeddedPackageDirectory(root, specifier) !== undefined)
    ? distributionRoots
    : [...projectRoots, ...distributionRoots.flatMap(distributionPackageRoots)];
}

function activationPath(item: ResolvedPackage): string {
  const declared = item.json.hypit?.activation;
  assert(declared !== undefined, `${item.json.name} does not declare hypit.activation`);
  assert(!isAbsolute(declared), `${item.json.name} activation must be package-relative`);
  const target = resolve(item.root, declared);
  const relation = relative(item.root, target);
  assert(relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`), `${item.json.name} activation escapes its package`);
  return target;
}

function embeddedByDistribution(
  item: ResolvedPackage,
  distributionRoots: readonly string[],
): boolean {
  return distributionRoots.some((root) => {
    const directory = embeddedPackageDirectory(root, item.json.name);
    return directory !== undefined && realpathSync.native(directory) === item.root;
  });
}

function embeddedPackageNamed(name: string, distributionRoots: readonly string[]): boolean {
  return distributionRoots.some((root) => embeddedPackageDirectory(root, name) !== undefined);
}

async function importContribution(
  item: ResolvedPackage,
  options: NodePackageLoadOptions,
  distributionRoots: readonly string[],
): Promise<PackageContribution> {
  const target = activationPath(item);
  assert((await stat(target)).isFile(), `${item.json.name} activation is not a file`);
  const url = pathToFileURL(target).href;
  const imported = await (options.importModule !== undefined && !embeddedByDistribution(item, distributionRoots)
    ? options.importModule(url) : import(url)) as { readonly default?: unknown };
  assert(imported.default !== null && typeof imported.default === "object", `${item.json.name} activation has no default package export`);
  const contribution = imported.default as Partial<PackageContribution>;
  assert(contribution.format === "hypit.package@1", `${item.json.name} activation has an unsupported package format`);
  return contribution as PackageContribution;
}

async function assertExternalDependencies(
  item: ResolvedPackage,
  distributionRoots: readonly string[],
): Promise<void> {
  const distributionOwned = embeddedByDistribution(item, distributionRoots);
  for (const [name, required] of Object.entries(item.json.dependencies)) {
    if (embeddedPackageNamed(name, distributionRoots) || required.startsWith("workspace:")) continue;
    try {
      const resolved = locateNodePackage(name, {
        from: join(item.root, "__hypit_package_dependencies__.mjs"),
        distributionRoots,
      });
      if (/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(required)
        && resolved.manifest.version !== required) {
        throw new Error(`installed version is ${resolved.manifest.version ?? "unknown"}`);
      }
    } catch (error) {
      const repair = distributionOwned
        ? "The active Distribution's npm manifest must provide it; reinstall or update that Distribution"
        : `Install it with the project package manager that owns ${item.root}`;
      throw new Error(`${item.json.name} requires ${name}@${required}. ${repair}`, { cause: error });
    }
  }
}

function addressKey(value: LogicalPackageAddress): string {
  return `${value.abi}\u0000${value.name}`;
}

function offers(value: PackageContribution): readonly LogicalPackageAddress[] {
  return [
    ...(value.modules ?? []).flatMap((item) => [
      moduleKey(item.manifest),
      ...(item.specifiers ?? []),
    ].map((name) => ({ abi: modulePackageAbi, name }))),
    ...(value.facets ?? []).flatMap((facet) => facet.address === undefined ? [] : [{ abi: facet.abi, name: facet.address }]),
  ];
}

/** Conventional physical package spelling for a logical @scope/name@version address. */
export function physicalPackageName(logical: string): string {
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
 * Node's package manager owns installed versions and bytes; Hypit validates only the
 * contribution boundary it consumes.
 */
export async function loadNodePackageSelection(
  request: readonly string[] | NodePackageSelectionRequest,
  root: string,
  options: NodePackageLoadOptions = {},
): Promise<readonly LoadedPackage[]> {
  const normalized: NodePackageSelectionRequest = Array.isArray(request)
    ? { selected: request }
    : request as NodePackageSelectionRequest;
  const selected = new Set(normalized.selected);
  for (const address of normalized.logical ?? []) selected.add(physicalPackageName(address.name));
  if (selected.size === 0) return [];

  const projectRoot = await realpath(root);
  const projectRoots = [projectRoot];
  const distributionRoots = (await Promise.all((options.fallbackRoots ?? []).map(async (candidate) =>
    await realpath(candidate))))
    .filter((candidate) => candidate !== projectRoot);
  const roots = await Promise.all([...selected].sort().map(async (name) =>
    await resolvePackage(name, resolutionRoots(name, projectRoots, distributionRoots))));
  type ActivatedPackage = { readonly physical: ResolvedPackage; readonly contribution: PackageContribution };
  const activated = new Map<string, ActivatedPackage>();
  const providedModules = new Set<string>();
  const requirements: { readonly key: string; readonly from: string }[] = [];
  const add = (item: ActivatedPackage): void => {
    assert(!activated.has(item.physical.json.name), `selected package ${item.physical.json.name} is repeated`);
    activated.set(item.physical.json.name, item);
    for (const module of item.contribution.modules ?? []) {
      const key = moduleKey(module.manifest);
      assert(!providedModules.has(key), `selected packages provide ${key} more than once`);
      providedModules.add(key);
      for (const dependency of module.manifest.dependencies) {
        requirements.push({
          key: moduleKey(dependency.module),
          from: item.physical.root,
        });
      }
    }
  };
  for (const item of await Promise.all(roots.map(async (physical) => ({
    physical,
    contribution: await (async () => {
      await assertExternalDependencies(physical, distributionRoots);
      return await importContribution(physical, options, distributionRoots);
    })(),
  })))) add(item);

  for (let cursor = 0; cursor < requirements.length; cursor += 1) {
    const requirement = requirements[cursor] as { readonly key: string; readonly from: string };
    if (providedModules.has(requirement.key)) continue;
    const providerPackage = physicalPackageName(requirement.key);
    assert(!activated.has(providerPackage), `selected package ${providerPackage} provides the wrong ${requirement.key}`);
    const physical = await resolvePackage(
      providerPackage,
      resolutionRoots(providerPackage, [requirement.from, root], distributionRoots),
    );
    await assertExternalDependencies(physical, distributionRoots);
    const provider = { physical, contribution: await importContribution(physical, options, distributionRoots) };
    add(provider);
    assert(providedModules.has(requirement.key), `${providerPackage} does not provide the required ${requirement.key}`);
  }

  const offerOwners = new Map<string, Set<string>>();
  for (const item of activated.values()) {
    for (const offer of offers(item.contribution)) {
      const key = addressKey(offer);
      const owners = offerOwners.get(key) ?? new Set<string>();
      owners.add(item.physical.json.name);
      offerOwners.set(key, owners);
    }
  }
  for (const address of normalized.logical ?? []) {
    const providers = offerOwners.get(addressKey(address));
    if (providers === undefined || providers.size === 0) throw new NodePackageSelectionMissingError(address);
    assert(providers.size === 1, `${address.abi} ${address.name} is provided by more than one selected package`);
  }

  const packages: LoadedPackage[] = [...activated.values()]
    .sort((left, right) => left.physical.json.name.localeCompare(right.physical.json.name))
    .map((item) => ({
      specifier: item.physical.json.name,
      contribution: item.contribution,
    }));
  verifyPackageContributions(packages.map((item) => item.contribution));
  return packages;
}
