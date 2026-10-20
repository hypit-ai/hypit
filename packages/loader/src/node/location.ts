import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Only absence is repairable by installing a package; malformed manifests and I/O errors are not. */
export class NodePackageNotFoundError extends Error {
  constructor(name: string) {
    super(`cannot locate installed package ${name}`);
    this.name = "NodePackageNotFoundError";
  }
}

export type LocatedNodePackage = {
  readonly root: string;
  readonly manifest: {
    readonly name: string;
    readonly version?: string;
    readonly bin?: string | Readonly<Record<string, string>>;
  };
};

export type LocatedNodePackageSource = {
  readonly specifier: string;
  readonly package: string;
  readonly root: string;
  readonly source: string;
};

export type LocatedNodePackageModule = {
  readonly specifier: string;
  readonly package: string;
  readonly root: string;
  readonly module: string;
};

export type LocatedNodePackageResource = {
  readonly specifier: string;
  readonly package: string;
  readonly root: string;
  readonly resource: string;
};

export type LocateNodePackageOptions = {
  /** File or module URL whose owning package is requesting the dependency. */
  readonly from: string | URL;
  /** Explicit project roots whose `packages/` or `services/` directories own selected packages. */
  readonly workspaceRoots?: readonly string[];
  /** Explicit Hypit Distribution roots available to this resolution. */
  readonly distributionRoots?: readonly string[];
};

function normalizedRoots(roots: readonly string[]): readonly string[] {
  return [...new Set(roots.map((root) => resolve(root)))];
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

function packageSourceAddress(value: string): { readonly name: string; readonly subpath: string } {
  if (value.startsWith(".") || value.startsWith("/") || value.startsWith("#") || value.includes(":")) {
    throw new Error(`${value} must be one npm package Source export`);
  }
  const parts = value.split("/");
  const name = value.startsWith("@")
    ? parts.length >= 2 ? `${parts[0]}/${parts[1]}` : ""
    : parts[0] ?? "";
  const subpath = value.startsWith("@") ? parts.slice(2).join("/") : parts.slice(1).join("/");
  packageName(name);
  if (subpath.length > 0
    && subpath.split("/").some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`${value} has an invalid package Source export path`);
  }
  return { name, subpath };
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

/** Root public exports, not the contents of a checkout, define embedded implementation ownership. */
export function embeddedPackageDirectory(root: string, name: string): string | undefined {
  const manifestPath = join(root, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { exports?: unknown };
  const targets = (value: unknown): string[] => typeof value === "string" ? [value]
    : value !== null && typeof value === "object" ? Object.values(value).flatMap(targets) : [];
  for (const target of targets(manifest.exports)) {
    const match = /^\.\/(packages|services)\/([^/]+)\//u.exec(target);
    if (match === null) continue;
    const directory = join(root, match[1]!, match[2]!);
    if (readPackage(directory, name) !== undefined) return directory;
  }
  return undefined;
}

/** Explicit installed default owners. This never searches for plugins or loads their code. */
export function distributionPackageRoots(root: string): readonly string[] {
  const roots: string[] = [];
  const visit = (candidate: string): void => {
    const current = resolve(candidate);
    if (roots.includes(current)) return;
    roots.push(current);
    const path = join(current, "package.json");
    if (!existsSync(path)) return;
    const manifest = JSON.parse(readFileSync(path, "utf8")) as {
      dependencies?: Readonly<Record<string, string>>;
      hypit?: { packageSources?: unknown };
    };
    const sources = manifest.hypit?.packageSources;
    if (sources === undefined) return;
    if (!Array.isArray(sources) || sources.some((name) => typeof name !== "string")) {
      throw new Error(`${path}.hypit.packageSources must be package names`);
    }
    for (const source of sources as string[]) {
      const name = packageName(source);
      if (manifest.dependencies?.[name] === undefined) {
        throw new Error(`${path} must declare default package source ${name} as a dependency`);
      }
      const located = ancestorPackage(name, join(current, "__hypit_defaults__.mjs"));
      if (located === undefined) throw new NodePackageNotFoundError(name);
      visit(located.root);
    }
  };
  visit(root);
  return roots;
}

function distributionPackage(root: string, name: string): LocatedNodePackage | undefined {
  const directory = distributionPackageDirectory(root, name);
  return directory === undefined ? nodeModulesPackage(root, name) : readPackage(directory, name);
}

/**
 * Locate package identity without assuming it has a CommonJS/root export. An exact package
 * physically embedded by the active Distribution is protected from project shadowing. Every other
 * package, including an independently published @hypit package, follows ordinary project-first
 * resolution and may use a Distribution dependency only as its installed fallback.
 */
export function locateNodePackage(nameValue: string, options: LocateNodePackageOptions): LocatedNodePackage {
  const name = packageName(nameValue);
  const from = fromPath(options.from);
  const workspaceRoots = normalizedRoots(options.workspaceRoots ?? []);
  const distributionRoots = normalizedRoots(options.distributionRoots ?? []);
  const nearby = ancestorPackage(name, from);

  for (const root of distributionRoots) {
    const directory = embeddedPackageDirectory(root, name);
    const embedded = directory === undefined ? undefined : readPackage(directory, name);
    if (embedded !== undefined) return embedded;
  }

  if (nearby !== undefined) return nearby;
  for (const root of workspaceRoots) {
    const found = distributionPackage(root, name);
    if (found !== undefined) return found;
  }
  for (const root of distributionRoots) {
    for (const source of distributionPackageRoots(root)) {
      const embedded = embeddedPackageDirectory(source, name);
      const found = embedded === undefined ? nodeModulesPackage(source, name) : readPackage(embedded, name);
      if (found !== undefined) return found;
    }
  }
  throw new NodePackageNotFoundError(name);
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

function importExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const conditions = value as Readonly<Record<string, unknown>>;
  return typeof conditions.import === "string"
    ? conditions.import
    : typeof conditions.default === "string" ? conditions.default : undefined;
}

/** Resolve an explicitly named package asset; package exports are module API, not a file inventory. */
export function resolveNodePackageResource(
  name: string,
  relativePath: string,
  options: LocateNodePackageOptions,
): string {
  return packageFile(locateNodePackage(name, options), relativePath, `${name} resource path`);
}

/** Resolve `package:<name>/<path>` without importing or executing the package. */
export function resolveNodePackageResourceSpecifier(
  specifier: string,
  options: LocateNodePackageOptions,
): LocatedNodePackageResource {
  if (!specifier.startsWith("package:")) {
    throw new Error(`${specifier} must use the package: asset scheme`);
  }
  const address = packageSourceAddress(specifier.slice("package:".length));
  if (address.subpath.length === 0) {
    throw new Error(`${specifier} must name one package-relative asset`);
  }
  const located = locateNodePackage(address.name, options);
  return {
    specifier,
    package: address.name,
    root: located.root,
    resource: packageFile(located, address.subpath, `${address.name} resource path`),
  };
}

/**
 * Resolve one explicitly imported Source through the owning package's standard `exports` map.
 * This reads package data only; it never imports `hypit.activation` or executes package code.
 */
function resolveNodePackageExport(
  specifier: string,
  options: LocateNodePackageOptions,
  kind: "Source" | "module",
): LocatedNodePackageSource {
  const address = packageSourceAddress(specifier);
  const located = locateNodePackage(address.name, options);
  const manifestPath = join(located.root, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    readonly name?: unknown;
    readonly exports?: unknown;
  };
  if (manifest.name !== address.name) throw new Error(`${manifestPath} does not describe ${address.name}`);
  const key = address.subpath.length === 0 ? "." : `./${address.subpath}`;
  let declared: unknown;
  if (typeof manifest.exports === "string") {
    if (key === ".") declared = manifest.exports;
  } else if (manifest.exports !== null && typeof manifest.exports === "object" && !Array.isArray(manifest.exports)) {
    declared = (manifest.exports as Readonly<Record<string, unknown>>)[key];
  }
  const target = importExportTarget(declared);
  if (target === undefined) {
    throw new Error(`${address.name} does not export ${kind} ${key}`);
  }
  return {
    specifier,
    package: address.name,
    root: located.root,
    source: packageFile(located, target, `${address.name} ${kind} export ${key}`),
  };
}

export function resolveNodePackageSource(
  specifier: string,
  options: LocateNodePackageOptions,
): LocatedNodePackageSource {
  return resolveNodePackageExport(specifier, options, "Source");
}

/** Resolve one explicitly selected executable module through the package's exports map. */
export function resolveNodePackageModule(
  specifier: string,
  options: LocateNodePackageOptions,
): LocatedNodePackageModule {
  const located = resolveNodePackageExport(specifier, options, "module");
  return {
    specifier: located.specifier,
    package: located.package,
    root: located.root,
    module: located.source,
  };
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
