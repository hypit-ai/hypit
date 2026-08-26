import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type LocatedNodePackage = {
  readonly root: string;
  readonly manifest: {
    readonly name: string;
    readonly version?: string;
    readonly bin?: string | Readonly<Record<string, string>>;
  };
};

export type LocateNodePackageOptions = {
  /** File or module URL whose owning package is requesting the dependency. */
  readonly from: string | URL;
  /** Explicit project roots whose `packages/` or `services/` directories own selected packages. */
  readonly workspaceRoots?: readonly string[];
  /** Defaults to the active Hypit Distribution roots. */
  readonly distributionRoots?: readonly string[];
  /** Defaults to the active machine npm package roots. */
  readonly externalRoots?: readonly string[];
  /** Defaults to true only when `from` belongs to the active Distribution. */
  readonly allowExternal?: boolean;
};

let activeDistributionRoots: readonly string[] = [];
let activeExternalRoots: readonly string[] = [];

function normalizedRoots(roots: readonly string[]): readonly string[] {
  return [...new Set(roots.map((root) => resolve(root)))];
}

export function setActiveDistributionPackageRoots(roots: readonly string[]): void {
  activeDistributionRoots = normalizedRoots(roots);
}

export function setActiveExternalPackageRoots(roots: readonly string[]): void {
  activeExternalRoots = normalizedRoots(roots);
}

export function externalPackageRoots(): readonly string[] {
  return activeExternalRoots;
}

function within(root: string, candidate: string): boolean {
  const relation = relative(resolve(root), resolve(candidate));
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function packageName(value: string): string {
  const parts = value.split("/");
  const segment = (item: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(item)
    && item !== "." && item !== "..";
  const valid = value.startsWith("@")
    ? parts.length === 2 && parts[0]!.startsWith("@") && segment(parts[0]!.slice(1)) && segment(parts[1]!)
    : parts.length === 1 && segment(value);
  if (!valid) throw new Error(`${value} must be one exact npm package name`);
  return value;
}

function fromPath(value: string | URL): string {
  return value instanceof URL || value.startsWith("file:") ? fileURLToPath(value) : resolve(value);
}

function readPackage(root: string, expectedName: string): LocatedNodePackage | undefined {
  const path = join(root, "package.json");
  if (!existsSync(path)) return undefined;
  const value = JSON.parse(readFileSync(path, "utf8")) as {
    readonly name?: unknown;
    readonly version?: unknown;
    readonly bin?: unknown;
  };
  if (value.name !== expectedName) return undefined;
  const bin = typeof value.bin === "string"
    ? value.bin
    : value.bin !== null && typeof value.bin === "object" && !Array.isArray(value.bin)
      ? Object.fromEntries(Object.entries(value.bin).map(([name, target]) => {
        if (typeof target !== "string") throw new Error(`${path}.bin.${name} must be a string`);
        return [name, target];
      }))
      : undefined;
  if (value.version !== undefined && typeof value.version !== "string") {
    throw new Error(`${path}.version must be a string`);
  }
  return {
    // `.native` because this is the physical path, and on Windows the JavaScript `realpathSync`
    // resolves symlinks and junctions without expanding an 8.3 short name. A temporary directory
    // under a service account arrives as `RUNNER~1\AppData\...`, so a root located here and the same
    // root canonicalized through the asynchronous `realpath` — which does go through libuv — are two
    // different strings for one directory, and every comparison between them fails.
    root: realpathSync.native(root),
    manifest: {
      name: expectedName,
      ...(value.version === undefined ? {} : { version: value.version }),
      ...(bin === undefined ? {} : { bin }),
    },
  };
}

function nodeModulesPackage(root: string, name: string): LocatedNodePackage | undefined {
  return readPackage(join(root, "node_modules", ...name.split("/")), name);
}

function ancestorPackage(name: string, from: string): LocatedNodePackage | undefined {
  let cursor = dirname(from);
  while (true) {
    const found = nodeModulesPackage(cursor, name);
    if (found !== undefined) return found;
    const parent = dirname(cursor);
    if (parent === cursor) return undefined;
    cursor = parent;
  }
}

export function distributionPackageDirectory(root: string, name: string): string | undefined {
  const conventional = join(resolve(root), "packages", name.split("/").at(-1)!);
  if (readPackage(conventional, name) !== undefined) return conventional;
  const services = join(resolve(root), "services");
  if (!existsSync(services)) return undefined;
  for (const entry of readdirSync(services, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(services, entry.name);
    if (readPackage(candidate, name) !== undefined) return candidate;
  }
  return undefined;
}

function distributionPackage(root: string, name: string): LocatedNodePackage | undefined {
  const directory = distributionPackageDirectory(root, name);
  return directory === undefined ? nodeModulesPackage(root, name) : readPackage(directory, name);
}

/**
 * Locate package identity without assuming it has a CommonJS/root export. Package ownership stays
 * explicit: @hypit belongs to the Distribution, project dependencies stay project-local, and only
 * Distribution code may fall back to the machine npm home.
 */
export function locateNodePackage(nameValue: string, options: LocateNodePackageOptions): LocatedNodePackage {
  const name = packageName(nameValue);
  const from = fromPath(options.from);
  const workspaceRoots = normalizedRoots(options.workspaceRoots ?? []);
  const distributionRoots = normalizedRoots(options.distributionRoots ?? activeDistributionRoots);
  const externalRoots = normalizedRoots(options.externalRoots ?? activeExternalRoots);
  const nearby = ancestorPackage(name, from);

  if (name.startsWith("@hypit/")) {
    if (nearby !== undefined && (distributionRoots.length === 0
      || distributionRoots.some((root) => within(root, nearby.root)))) return nearby;
    for (const root of distributionRoots) {
      const found = distributionPackage(root, name);
      if (found !== undefined) return found;
    }
    throw new Error(`Active Hypit Distribution does not provide ${name}`);
  }

  if (nearby !== undefined) return nearby;
  for (const root of workspaceRoots) {
    const found = distributionPackage(root, name);
    if (found !== undefined) return found;
  }
  const allowExternal = options.allowExternal
    ?? distributionRoots.some((root) => within(root, dirname(from)));
  if (allowExternal) {
    for (const root of externalRoots) {
      const found = nodeModulesPackage(root, name);
      if (found !== undefined) return found;
    }
  }
  throw new Error(`cannot locate installed package ${name}`);
}

function packageFile(
  packageValue: LocatedNodePackage,
  relativePath: string,
  subject: string,
): string {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new Error(`${subject} must be a non-empty package-relative path`);
  }
  const target = resolve(packageValue.root, relativePath);
  const relation = relative(packageValue.root, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`${subject} escapes ${packageValue.manifest.name}`);
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    throw new Error(`${packageValue.manifest.name} does not contain ${relativePath}`);
  }
  return target;
}

/** Resolve an explicitly named package asset; package exports are module API, not a file inventory. */
export function resolveNodePackageResource(
  name: string,
  relativePath: string,
  options: LocateNodePackageOptions,
): string {
  return packageFile(locateNodePackage(name, options), relativePath, `${name} resource path`);
}

/** Resolve a command from the package's standard npm `bin` declaration. */
export function resolveNodePackageExecutable(
  name: string,
  executable: string | undefined,
  options: LocateNodePackageOptions,
): string {
  const located = locateNodePackage(name, options);
  const declared = located.manifest.bin;
  let target: string | undefined;
  if (typeof declared === "string") {
    const defaultName = name.split("/").at(-1)!;
    if (executable === undefined || executable === defaultName) target = declared;
  } else if (declared !== undefined) {
    if (executable !== undefined) target = declared[executable];
    else if (Object.keys(declared).length === 1) target = Object.values(declared)[0];
  }
  if (target === undefined) {
    throw new Error(`${name} does not declare${executable === undefined ? " one unambiguous executable" : ` executable ${executable}`}`);
  }
  return packageFile(located, target, `${name} executable`);
}
