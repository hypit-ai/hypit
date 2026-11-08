import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function npmCli() {
  const value = process.env.npm_execpath;
  if (!value?.endsWith("npm-cli.js")) {
    throw new Error("Run release candidate commands through npm.");
  }
  return value;
}

function runNpm(args) {
  execFileSync(process.execPath, [npmCli(), ...args], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
}

async function manifest(path) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8"));
}

function workspaceEdges(packageManifest) {
  return Object.entries({
    ...(packageManifest.dependencies ?? {}),
    ...(packageManifest.optionalDependencies ?? {}),
    ...(packageManifest.peerDependencies ?? {}),
  }).filter(([, version]) => typeof version === "string" && version.startsWith("workspace:"))
    .map(([name]) => name);
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).flatMap(exportTargets);
}

/**
 * Resolve the independently versioned packages selected by the product Distribution.
 * package.json remains the only product-default list; this function only plans its npm release order.
 */
export async function releaseCandidatePackages() {
  const rootManifest = await manifest("package.json");
  const workspaceManifests = await Promise.all(globSync("packages/*/package.json", {
    cwd: repositoryRoot,
  }).sort().map(async (path) => ({ path, manifest: await manifest(path) })));
  const byName = new Map(workspaceManifests.map((item) => [item.manifest.name, item]));
  const embedded = new Set(exportTargets(rootManifest.exports ?? {}).flatMap((target) => {
    const match = /^\.\/packages\/([^/]+)\//u.exec(target);
    return match === null ? [] : [`@hypit/${match[1]}`];
  }));
  const selected = new Map();
  const select = (name, owner) => {
    if (name === rootManifest.name || selected.has(name)) return;
    const item = byName.get(name);
    if (item === undefined) throw new Error(`${owner} dependency ${name} is not a workspace package`);
    if (item.manifest.version === "0.0.0-dev") {
      if (embedded.has(name)) return;
      throw new Error(`${owner} makes unversioned internal package ${name} an independent release dependency`);
    }
    selected.set(name, item);
    for (const dependency of workspaceEdges(item.manifest)) select(dependency, name);
  };
  for (const name of workspaceEdges(rootManifest)) select(name, rootManifest.name);

  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (name) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Independent release dependency cycle includes ${name}`);
    visiting.add(name);
    const item = selected.get(name);
    for (const dependency of workspaceEdges(item.manifest).sort()) {
      if (selected.has(dependency)) visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push({
      name,
      version: item.manifest.version,
      directory: dirname(item.path),
    });
  };
  for (const name of [...selected.keys()].sort()) visit(name);

  return {
    independent: ordered,
    distribution: { name: rootManifest.name, version: rootManifest.version, directory: "." },
  };
}

export function npmTarballFilename(name, version) {
  return `${name.replace(/^@/u, "").replaceAll("/", "-")}-${version}.tgz`;
}

/** Publishing is an explicit subset of the verified installation candidate. */
export function selectReleasePackages(plan, names = [], independentOnly = false) {
  const available = independentOnly ? [...plan.independent] : [...plan.independent, plan.distribution];
  if (names.length === 0) return available;
  const requested = new Set(names);
  for (const name of requested) {
    if (!available.some((item) => item.name === name)) throw new Error(`Release candidate does not contain ${name}`);
  }
  return available.filter((item) => requested.has(item.name));
}

export async function releaseCandidateTarballs(outputDirectory = "dist/release") {
  const plan = await releaseCandidatePackages();
  const output = resolve(repositoryRoot, outputDirectory);
  return {
    independent: plan.independent.map((item) => resolve(output, npmTarballFilename(item.name, item.version))),
    distribution: resolve(output, npmTarballFilename(plan.distribution.name, plan.distribution.version)),
    plan: resolve(output, "release-plan.json"),
  };
}

export async function packReleaseCandidate(outputDirectory = "dist/release") {
  const { packIndependentPackage } = await import("./pack-independent-package.mjs");
  const plan = await releaseCandidatePackages();
  const output = resolve(repositoryRoot, outputDirectory);
  // One candidate directory represents exactly one dependency closure. Reusing artifacts from an
  // older architecture would make an uploaded directory lie about what this commit selected.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  runNpm(["run", "build:public-types"]);
  for (const item of plan.independent) {
    const tarball = await packIndependentPackage(item.directory, outputDirectory, { buildPublicTypes: false });
    console.log(`Prepared ${item.name}@${item.version}: ${tarball}`);
  }
  runNpm(["run", "pack:distribution", "--", "--types-built"]);
  const candidate = await releaseCandidateTarballs(outputDirectory);
  await writeFile(candidate.plan, `${JSON.stringify({
    format: "hypit.release-plan@1",
    independent: plan.independent.map(({ name, version }) => ({
      name,
      version,
      filename: npmTarballFilename(name, version),
    })),
    distribution: {
      name: plan.distribution.name,
      version: plan.distribution.version,
      filename: npmTarballFilename(plan.distribution.name, plan.distribution.version),
    },
  }, null, 2)}\n`);
  return candidate;
}
