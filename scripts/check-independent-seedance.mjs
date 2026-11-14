import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  installDistributionPackageResolution,
  loadNodePackageSelection,
  resolveNodePackageSource,
} from "../packages/loader/src/node/index.ts";

import { packConsumerDependencies, consumerHostManifest } from "./independent-consumer.mjs";

import { packIndependentPackage, releasedPackageDependencyMap } from "./pack-independent-package.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli?.endsWith("npm-cli.js")) {
  throw new Error("Run npm run check:seedance-package.");
}

const root = await mkdtemp(join(tmpdir(), "hypit-seedance-consumer-"));
const output = join(root, "packages");
const consumer = join(root, "consumer");
const distribution = join(root, "distribution");
let passed = false;
try {
  const seedance = await packIndependentPackage("packages/seedance", output);
  const kits = await packIndependentPackage("packages/seedance-kits", output, { buildPublicTypes: false });
  const dependencies = await packConsumerDependencies(["seedance", "seedance-kits"], output);
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    name: "seedance-independent-consumer",
    private: true,
    type: "module",
  }, null, 2)}\n`);
  execFileSync(process.execPath, [
    npmCli,
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--legacy-peer-deps",
    ...dependencies,
    seedance,
    kits,
  ], {
    cwd: consumer,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: join(root, "npm-cache") },
  });

  const installedManifest = JSON.parse(await readFile(
    join(consumer, "node_modules", "@hypit", "seedance", "package.json"),
    "utf8",
  ));
  assert.equal(installedManifest.private, undefined);
  assert.equal(installedManifest.exports["."], "./dist/index.js");
  assert.equal(installedManifest.hypit.activation, "./dist/activation.js");
  assert.deepEqual(installedManifest.dependencies,
    await releasedPackageDependencyMap("packages/seedance", "dependencies"));
  assert.deepEqual(installedManifest.peerDependencies,
    await releasedPackageDependencyMap("packages/seedance", "peerDependencies"));
  const installedSeedanceRoot = join(consumer, "node_modules", "@hypit", "seedance");
  await access(join(installedSeedanceRoot, "dist", "activation.js"));
  await access(join(installedSeedanceRoot, "LICENSE"));
  await assert.rejects(access(join(installedSeedanceRoot, "src", "activation.ts")));

  const installedKitsRoot = join(consumer, "node_modules", "@hypit", "seedance-kits");
  const installedKitsManifest = JSON.parse(await readFile(join(installedKitsRoot, "package.json"), "utf8"));
  assert.equal(installedKitsManifest.private, undefined);
  assert.equal(installedKitsManifest.hypit, undefined);
  await access(join(installedKitsRoot, "kits", "speaker-v1.svml"));
  await access(join(installedKitsRoot, "LICENSE"));

  await mkdir(join(distribution, "packages"), { recursive: true });
  await writeFile(join(distribution, "package.json"), JSON.stringify(await consumerHostManifest()));
  for (const entry of await readdir(join(repositoryRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "seedance" || entry.name === "seedance-kits") continue;
    await symlink(join(repositoryRoot, "packages", entry.name), join(distribution, "packages", entry.name),
      process.platform === "win32" ? "junction" : "dir");
  }

  installDistributionPackageResolution([distribution]);
  const loaded = await loadNodePackageSelection(["@hypit/seedance"], consumer, {
    fallbackRoots: [distribution],
  });
  const installedSeedance = loaded.find((item) => item.specifier === "@hypit/seedance");
  assert.ok(installedSeedance);
  assert.ok(installedSeedance.contribution.facets?.some((facet) =>
    facet.kind === "hypit.module" && facet.address === "@hypit/seedance"));

  const source = resolveNodePackageSource("@hypit/seedance-kits/speaker", {
    from: join(consumer, "package.json"),
    workspaceRoots: [consumer],
    distributionRoots: [],
  });
  assert.equal(source.package, "@hypit/seedance-kits");
  assert.match(await readFile(source.source, "utf8"), /speaker-v1/u);
  const lock = await readFile(join(consumer, "package-lock.json"), "utf8");
  assert.ok(lock.includes(seedance.split(/[\\/]/u).at(-1)));
  assert.ok(lock.includes(kits.split(/[\\/]/u).at(-1)));
  passed = true;
  console.log(`Independent Seedance consumer passed: ${seedance}, ${kits}`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Independent Seedance consumer retained at ${root}`);
}
