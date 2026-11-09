import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  installDistributionPackageResolution,
  loadNodePackageSelection,
} from "../packages/loader/src/node/index.ts";

import { packConsumerDependencies, consumerHostManifest, defaultPackageNames } from "./independent-consumer.mjs";

import { packIndependentPackage, releasedPackageDependencyMap } from "./pack-independent-package.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli?.endsWith("npm-cli.js")) throw new Error("Run npm run check:runtime-packages.");

const packageDirectories = [
  "credential-store-env",
  "credential-store-local",
  "media-local",
  "provider-html-local",
  "provider-image-opencv-local",
  "provider-whisperx-local",
  "provider-beatapi",
  "provider-hiapi",
  "provider-monid",
  "provider-pollo",
  "provider-sume",
  "provider-tokendance",
];
const packageNames = packageDirectories.map((name) => `@hypit/${name}`);
const defaultPackages = [
  "@hypit/credential-store-env",
  "@hypit/credential-store-local",
  "@hypit/media-local",
  "@hypit/provider-html-local",
  "@hypit/provider-image-opencv-local",
  "@hypit/provider-whisperx-local",
];
const optionalPackages = [
  "@hypit/provider-beatapi",
  "@hypit/provider-hiapi",
  "@hypit/provider-monid",
  "@hypit/provider-pollo",
  "@hypit/provider-sume",
  "@hypit/provider-tokendance",
];

const root = await mkdtemp(join(tmpdir(), "hypit-runtime-package-consumer-"));
const output = join(root, "packages");
const consumer = join(root, "consumer");
const distribution = join(root, "distribution");
let passed = false;
try {
  const distributionManifest = await consumerHostManifest();
  for (const name of defaultPackages) {
    assert.equal((await defaultPackageNames()).has(name), true, `${name} must be a default dependency`);
  }
  for (const name of optionalPackages) {
    assert.equal((await defaultPackageNames()).has(name), false, `${name} must remain an optional install`);
  }

  const tarballs = [];
  const imageOperationsTarball = await packIndependentPackage("packages/image-operations", output, {
    buildPublicTypes: true,
  });
  const mediaOperationsTarball = await packIndependentPackage("packages/media-operations", output, {
    buildPublicTypes: false,
  });
  const narrativeSpeechAlignmentTarball = await packIndependentPackage(
    "packages/narrative-speech-alignment",
    output,
    { buildPublicTypes: false },
  );
  for (const directory of packageDirectories) {
    tarballs.push(await packIndependentPackage(`packages/${directory}`, output, {
      buildPublicTypes: false,
    }));
  }
  tarballs.push(await packIndependentPackage("packages/whisperx", output, { buildPublicTypes: false }));

  const dependencies = await packConsumerDependencies([...packageDirectories, "image-operations", "media-operations", "narrative-speech-alignment", "whisperx"], output);
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    name: "hypit-runtime-package-consumer",
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
    imageOperationsTarball,
    mediaOperationsTarball,
    narrativeSpeechAlignmentTarball,
    ...tarballs,
  ], {
    cwd: consumer,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_cache: join(root, "npm-cache"),
      npm_config_update_notifier: "false",
    },
  });

  for (const [index, name] of packageNames.entries()) {
    const directory = packageDirectories[index];
    const installed = join(consumer, "node_modules", "@hypit", directory);
    const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
    assert.equal(manifest.private, undefined, `${name} must be publishable`);
    assert.deepEqual(manifest.repository, distributionManifest.repository,
      `${name} must identify its provenance repository`);
    assert.equal(manifest.exports["."], "./dist/index.js");
    assert.equal(manifest.hypit.activation, "./dist/activation.js");
    assert.deepEqual(manifest.dependencies ?? {},
      await releasedPackageDependencyMap(`packages/${directory}`, "dependencies"));
    assert.deepEqual(manifest.peerDependencies ?? {},
      await releasedPackageDependencyMap(`packages/${directory}`, "peerDependencies"));
    for (const version of Object.values({
      ...(manifest.dependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    })) assert.doesNotMatch(version, /^workspace:/u, `${name} leaked a workspace range`);
    await access(join(installed, "dist", "activation.js"));
    await access(join(installed, "LICENSE"));
    await assert.rejects(access(join(installed, "src")), undefined, `${name} must not publish TypeScript sources`);
  }

  const whisperRuntime = join(consumer, "node_modules", "@hypit", "provider-whisperx-local", "runtime");
  await access(join(whisperRuntime, "pyproject.toml"));
  await access(join(whisperRuntime, "uv.lock"));
  await access(join(whisperRuntime, "src", "hypit_whisperx_service", "server.py"));
  const whisperRuntimeFiles = await readdir(whisperRuntime, { recursive: true });
  assert.equal(whisperRuntimeFiles.some((path) => path.split(/[\\/]/u).includes("__pycache__")
    || path.endsWith(".pyc") || path.endsWith(".pyo")), false,
    "published Python Runtime must not contain interpreter caches");
  const openCvRuntime = join(consumer, "node_modules", "@hypit", "provider-image-opencv-local", "runtime");
  await access(join(openCvRuntime, "pyproject.toml"));
  await access(join(openCvRuntime, "uv.lock"));
  await access(join(openCvRuntime, "raster_execute.py"));

  await mkdir(join(distribution, "packages"), { recursive: true });
  await writeFile(join(distribution, "package.json"), `${JSON.stringify(distributionManifest, null, 2)}\n`);
  const independent = new Set([...packageDirectories, "whisperx", "image-operations"]);
  for (const entry of await readdir(join(repositoryRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || independent.has(entry.name)) continue;
    await symlink(join(repositoryRoot, "packages", entry.name), join(distribution, "packages", entry.name),
      process.platform === "win32" ? "junction" : "dir");
  }

  installDistributionPackageResolution([distribution]);
  const loaded = await loadNodePackageSelection(packageNames, consumer, { fallbackRoots: [distribution] });
  assert.deepEqual(loaded.map((item) => item.specifier).sort(), [...packageNames].sort());
  for (const item of loaded) {
    assert.equal(item.contribution.facets?.length, 1, `${item.specifier} must contribute one Runtime facet`);
  }

  const lock = await readFile(join(consumer, "package-lock.json"), "utf8");
  for (const tarball of tarballs) assert.ok(lock.includes(tarball.split(/[\\/]/u).at(-1)));
  passed = true;
  console.log(`Independent Runtime packages passed: ${packageNames.join(", ")}`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Independent Runtime package consumer retained at ${root}`);
}
