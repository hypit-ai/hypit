import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type RegistryPackageSpec = {
  readonly name: string;
  readonly version: string;
  readonly specifier: string;
};

export type HostPackageReport = RegistryPackageSpec & {
  readonly root: string;
  readonly action: "already-installed" | "installed";
};

export type HostPackageProgress = RegistryPackageSpec & {
  readonly phase: "checking" | "installing" | "ready";
};

function exactVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value);
}

/** Registry packages are pinned by version; npm owns their files and dependency graph. */
export function parseRegistryPackageSpec(specifier: string): RegistryPackageSpec {
  const value = specifier.trim();
  const slash = value.startsWith("@") ? value.indexOf("/", 1) : -1;
  const at = value.lastIndexOf("@");
  const split = value.startsWith("@") ? (at > slash ? at : -1) : at;
  const name = split > 0 ? value.slice(0, split) : "";
  const version = split > 0 ? value.slice(split + 1) : "";
  if (name.length === 0 || name.startsWith("@hypit/") || !exactVersion(version)) {
    throw new Error(
      `${specifier} must name one external npm registry package at an exact version, for example hyperframes@0.7.101`,
    );
  }
  if (name.startsWith("@") && (slash < 2 || slash >= name.length - 1)) {
    throw new Error(`${specifier} is not a valid scoped npm package specifier`);
  }
  if (!name.startsWith("@") && !/^[a-z0-9][a-z0-9._-]*$/u.test(name)) {
    throw new Error(`${specifier} is not a valid npm package specifier`);
  }
  return { name, version, specifier: `${name}@${version}` };
}

async function installedVersion(root: string, name: string): Promise<string | undefined> {
  try {
    const manifest = JSON.parse(await readFile(
      join(root, "node_modules", ...name.split("/"), "package.json"),
      "utf8",
    )) as { readonly name?: unknown; readonly version?: unknown };
    return manifest.name === name && typeof manifest.version === "string"
      ? manifest.version
      : undefined;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function inspectHostPackage(
  specifier: string,
  root: string,
): Promise<HostPackageReport | undefined> {
  const required = parseRegistryPackageSpec(specifier);
  const version = await installedVersion(resolve(root), required.name);
  return version === required.version
    ? { ...required, root: resolve(root), action: "already-installed" }
    : undefined;
}

function runNpm(root: string, specifiers: readonly string[]): Promise<void> {
  const npmArgs = [
    "install",
    "--prefix", root,
    "--save-exact",
    "--package-lock=false",
    "--no-audit",
    "--no-fund",
    "--omit=dev",
    ...specifiers,
  ];
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = windows ? ["/d", "/s", "/c", "npm.cmd", ...npmArgs] : npmArgs;
  return new Promise((done, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-32_000); });
    child.stderr.on("data", (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-32_000); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) done();
      else reject(new Error(`npm install failed${output.trim().length === 0 ? "" : `: ${output.trim().split("\n").at(-1)}`}`));
    });
  });
}

/**
 * Install missing upstream packages into one user/machine npm home.
 * npm's ordinary package.json is the only persistent package-set record; Hypit
 * creates no lock, receipt, hash inventory or project-local copy.
 */
export async function prepareHostPackages(
  specifiers: readonly string[],
  options: {
    readonly root: string;
    readonly onProgress?: (event: HostPackageProgress) => void;
  },
): Promise<readonly HostPackageReport[]> {
  const root = resolve(options.root);
  const byName = new Map<string, RegistryPackageSpec>();
  for (const specifier of specifiers) {
    const parsed = parseRegistryPackageSpec(specifier);
    const previous = byName.get(parsed.name);
    if (previous !== undefined && previous.version !== parsed.version) {
      throw new Error(`${parsed.name} is required at both ${previous.version} and ${parsed.version}`);
    }
    byName.set(parsed.name, parsed);
  }
  const required = [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
  const missing: RegistryPackageSpec[] = [];
  for (const item of required) {
    options.onProgress?.({ ...item, phase: "checking" });
    if (await installedVersion(root, item.name) !== item.version) missing.push(item);
  }
  if (missing.length > 0) {
    await mkdir(root, { recursive: true });
    try {
      await readFile(join(root, "package.json"), "utf8");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      await writeFile(join(root, "package.json"), `${JSON.stringify({
        name: "hypit-machine-packages",
        private: true,
        description: "Upstream npm packages used on demand by Hypit",
        dependencies: {},
      }, null, 2)}\n`, "utf8");
    }
    for (const item of missing) options.onProgress?.({ ...item, phase: "installing" });
    await runNpm(root, missing.map((item) => item.specifier));
  }
  const installed = new Set(missing.map((item) => item.name));
  const reports: HostPackageReport[] = [];
  for (const item of required) {
    const version = await installedVersion(root, item.name);
    if (version !== item.version) {
      throw new Error(`npm did not install ${item.specifier} into ${root}`);
    }
    options.onProgress?.({ ...item, phase: "ready" });
    reports.push({ ...item, root, action: installed.has(item.name) ? "installed" : "already-installed" });
  }
  return reports;
}
