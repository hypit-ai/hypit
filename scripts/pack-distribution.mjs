import { execFileSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { distributionEmbeddedPackageDirectories } from "./distribution-ownership.mjs";
import { releaseDependencyVersion } from "./release-dependencies.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist/release");
const npmCache = resolve(tmpdir(), "hypit-npm-cache");
const github = "https://github.com/hypit-ai/hypit/blob/main/";
const assets = "https://storage.googleapis.com/hypit-public-assets/showcase/npm/2026-09-10/";

// Run through npm so its CLI entry is portable, including on Windows.
const npmCli = process.env.npm_execpath;
if (!npmCli || !npmCli.endsWith("npm-cli.js")) {
  throw new Error("Run npm run pack:distribution to prepare the npm release.");
}
function npm(args, cwd, capture = false) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    env: { ...process.env, npm_config_cache: npmCache },
  });
}

const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => argument !== "--types-built")) throw new Error("Unknown distribution pack option.");
if (!arguments_.includes("--types-built")) npm(["run", "build:public-types"], root);
const [inventory] = JSON.parse(npm(["pack", "--dry-run", "--ignore-scripts", "--json"], root, true));
const embeddedPackageDirectories = await distributionEmbeddedPackageDirectories(root);
let readme = await readFile(resolve(root, "README.md"), "utf8");
const examples = readme.indexOf("## Examples\n");
const next = readme.indexOf("## Use the Hypit skill\n", examples);
if (examples < 0 || next < 0) throw new Error("README Examples section could not be located.");
readme = readme.slice(0, examples)
  + "[Watch the complete video examples on GitHub](https://github.com/hypit-ai/hypit#examples).\n\n"
  + readme.slice(next);
readme = readme
  .replace(/<picture>[\s\S]*?<\/picture>/u,
    `<img alt="Hypit" src="${assets}logo.svg" width="400" height="143">`)
  .replaceAll("https://github.com/user-attachments/assets/981c28e8-ddab-4164-85bc-03b5d71275dc", `${assets}demo-compact.gif`)
  .replaceAll("https://github.com/user-attachments/assets/cc929974-96b8-4166-b81d-008e130b0f24", `${assets}star.gif`)
  .replaceAll('href="./', `href="${github}`)
  .replaceAll("](./", `](${github}`)
  .replace("## Install once\n", "## Install once\n\nInstall the Hypit CLI (Node.js 22.15 or newer):\n\n```bash\nnpm install -g @hypit/hypit\n```\n\nAdd the Skill to your coding agent:\n");

const stage = await mkdtemp(resolve(tmpdir(), "hypit-npm-"));
try {
  // Use npm's own file selection; only the package-page README differs from the repository.
  for (const { path } of inventory.files) {
    if (path === "README.zh-CN.md") continue;
    const packageDirectory = /^packages\/([^/]+)\//u.exec(path)?.[1];
    if (packageDirectory !== undefined && !embeddedPackageDirectories.has(packageDirectory)) continue;
    const target = resolve(stage, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, path), target);
  }
  for (const directory of [...embeddedPackageDirectories].sort()) {
    const source = resolve(root, "packages", directory);
    const target = resolve(stage, "packages", directory);
    await mkdir(target, { recursive: true });
    await cp(resolve(source, "src"), resolve(target, "src"), { recursive: true });
    await copyFile(resolve(source, "package.json"), resolve(target, "package.json"));
    await copyFile(resolve(source, "README.md"), resolve(target, "README.md"));
  }
  await writeFile(resolve(stage, "README.md"), readme);
  const stagedManifestPath = resolve(stage, "package.json");
  const stagedManifest = JSON.parse(await readFile(stagedManifestPath, "utf8"));
  stagedManifest.files = [
    ...(stagedManifest.files ?? []).filter((path) => !path.startsWith("packages/")),
    ...[...embeddedPackageDirectories].sort().flatMap((directory) => [
      `packages/${directory}/src/**/*`,
      `packages/${directory}/package.json`,
      `packages/${directory}/README.md`,
    ]),
  ];
  const independentDefaults = Object.entries(stagedManifest.dependencies ?? {})
    .filter(([, version]) => typeof version === "string" && version.startsWith("workspace:"))
    .map(([name]) => name);
  stagedManifest.dependencies = Object.fromEntries(await Promise.all(
    Object.entries(stagedManifest.dependencies ?? {}).map(async ([name, version]) => [
      name,
      await releaseDependencyVersion(stagedManifest.name, name, version),
    ]),
  ));
  // Public paths resolve through the package that owns their implementation in this candidate.
  for (const [publicName, entry] of Object.entries(stagedManifest.exports ?? {})) {
    const targets = typeof entry === "string" ? [entry] : Object.values(entry);
    const source = targets.find(target => typeof target === "string" && target.startsWith("./packages/"));
    const match = source?.match(/^\.\/packages\/([^/]+)\/(.+)$/u);
    if (!match || embeddedPackageDirectories.has(match[1])) continue;
    const owner = JSON.parse(await readFile(resolve(root, "packages", match[1], "package.json"), "utf8"));
    const ownerEntry = Object.entries(owner.exports ?? {}).find(([, target]) => target === `./${match[2]}`);
    if (!ownerEntry) throw new Error(`${publicName} has no exported owner in ${owner.name}`);
    const specifier = owner.name + (ownerEntry[0] === "." ? "" : ownerEntry[0].slice(1));
    const facade = `./dist/public-modules/${publicName.slice(2).replaceAll("/", "-")}.mjs`;
    await mkdir(dirname(resolve(stage, facade)), { recursive: true });
    await writeFile(resolve(stage, facade), `export * from ${JSON.stringify(specifier)};\n`);
    stagedManifest.exports[publicName] = typeof entry === "string" ? facade : Object.fromEntries(
      Object.entries(entry).map(([condition, target]) => [condition, condition === "types" ? target : facade]));
    stagedManifest.dependencies[owner.name] = owner.version;
  }
  stagedManifest.files.push("dist/public-modules/*.mjs");
  delete stagedManifest.devDependencies;
  await writeFile(stagedManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`);

  for (const name of independentDefaults) {
    if (stagedManifest.dependencies[name] === undefined) {
      throw new Error(`Default independent package ${name} is not a Distribution dependency`);
    }
    if (embeddedPackageDirectories.has(name.split("/")[1])) {
      throw new Error(`Default independent package ${name} is still physically embedded`);
    }
  }
  await mkdir(output, { recursive: true });
  const packed = npm(["pack", "--ignore-scripts", "--pack-destination", output, "--json"], stage, true);
  const [packedInventory] = JSON.parse(packed);
  const packedPaths = new Set(packedInventory.files.map(({ path }) => path));
  for (const directory of embeddedPackageDirectories) {
    if (!packedPaths.has(`packages/${directory}/package.json`)
      || ![...packedPaths].some((path) => path.startsWith(`packages/${directory}/src/`))) {
      throw new Error(`Embedded Distribution package @hypit/${directory} is incomplete in the npm tarball`);
    }
  }
  await writeFile(resolve(output, "README.md"), readme);
  console.log(packed);
} finally {
  await rm(stage, { recursive: true, force: true });
}
