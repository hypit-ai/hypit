import { globSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function manifest(root, path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

function packageName(specifier) {
  return specifier.match(/^@[^/]+\/[^/]+|^[^/]+/u)?.[0];
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).flatMap(exportTargets);
}

function workspaceDependencies(value) {
  return Object.entries({
    ...(value.dependencies ?? {}),
    ...(value.optionalDependencies ?? {}),
    ...(value.peerDependencies ?? {}),
  }).filter(([, version]) => typeof version === "string" && version.startsWith("workspace:"))
    .map(([name]) => name);
}

/** The package directories whose bytes are owned by the root Distribution tarball. */
export async function distributionEmbeddedPackageDirectories(repositoryRoot) {
  const rootManifest = await manifest(repositoryRoot, "package.json");
  const paths = [
    ...globSync("packages/*/package.json", { cwd: repositoryRoot }),
    ...globSync("services/*/package.json", { cwd: repositoryRoot }),
  ].map((path) => path.replaceAll("\\", "/")).sort();
  const packages = await Promise.all(paths.map(async (path) => ({
    path,
    manifest: await manifest(repositoryRoot, path),
  })));
  const byName = new Map(packages.map((item) => [item.manifest.name, item]));
  const independentNames = new Set();
  const independent = (name) => {
    if (name === rootManifest.name || independentNames.has(name)) return;
    const item = byName.get(name);
    if (item === undefined) throw new Error(`Unknown independent workspace package ${name}`);
    independentNames.add(name);
    for (const dependency of workspaceDependencies(item.manifest)) independent(dependency);
  };
  for (const name of workspaceDependencies(rootManifest)) independent(name);

  const roots = new Set();
  for (const use of rootManifest.hypit?.cli?.use ?? []) {
    const name = packageName(use);
    if (name !== undefined) roots.add(name);
  }
  for (const target of exportTargets(rootManifest.exports ?? {})) {
    const match = /^\.\/packages\/([^/]+)\//u.exec(target);
    if (match !== null) roots.add(`@hypit/${match[1]}`);
  }

  const selected = new Set();
  const select = (name, owner) => {
    if (name === rootManifest.name || independentNames.has(name) || selected.has(name)) return;
    const item = byName.get(name);
    if (item === undefined) throw new Error(`${owner} embeds unknown workspace dependency ${name}`);
    selected.add(name);
    for (const dependency of workspaceDependencies(item.manifest)) select(dependency, name);
  };
  for (const root of [...roots].sort()) select(root, rootManifest.name);

  return new Set(packages.flatMap((item) => {
    if (!selected.has(item.manifest.name) || !item.path.startsWith("packages/")) return [];
    return [item.path.split("/")[1]];
  }));
}
