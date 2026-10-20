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
import { compositionTypes } from "../packages/composition/src/index.ts";
import { refinementPackagesFromFacets } from "../packages/refinement/src/index.ts";
import { producerPackagesFromFacets } from "../packages/producer/src/index.ts";
import { studioContributionFromPackage } from "../packages/studio-companion/src/index.ts";

import { packConsumerDependencies, consumerHostManifest, defaultPackageNames } from "./independent-consumer.mjs";

import { packIndependentPackage, releasedPackageDependencyMap } from "./pack-independent-package.mjs";
import { distributionEmbeddedPackageDirectories } from "./distribution-ownership.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli?.endsWith("npm-cli.js")) {
  throw new Error("Run npm run check:audio-track-package.");
}

const root = await mkdtemp(join(tmpdir(), "hypit-audio-track-consumer-"));
const output = join(root, "packages");
const consumer = join(root, "consumer");
const distribution = join(root, "distribution");
let passed = false;
try {
  const tarball = await packIndependentPackage("packages/audio-track", output);
  const dependencies = await packConsumerDependencies(["audio-track"], output);
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    name: "audio-track-independent-consumer",
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
    tarball,
  ], {
    cwd: consumer,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: join(root, "npm-cache") },
  });

  const installedRoot = join(consumer, "node_modules", "@hypit", "audio-track");
  const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
  assert.equal(installedManifest.private, undefined);
  assert.equal(installedManifest.exports["."], "./dist/index.js");
  assert.equal(installedManifest.exports["./studio"], "./dist/studio.js");
  assert.equal(installedManifest.hypit.activation, "./dist/activation.js");
  assert.deepEqual(installedManifest.dependencies,
    await releasedPackageDependencyMap("packages/audio-track", "dependencies"));
  assert.deepEqual(installedManifest.peerDependencies,
    await releasedPackageDependencyMap("packages/audio-track", "peerDependencies"));
  await access(join(installedRoot, "dist", "activation.js"));
  await access(join(installedRoot, "dist", "studio.js"));
  await access(join(installedRoot, "README.md"));
  await assert.rejects(access(join(installedRoot, "src", "activation.ts")));

  await mkdir(join(distribution, "packages"), { recursive: true });
  const rootManifest = await consumerHostManifest();
  assert.equal(rootManifest.exports["./audio-track"], undefined);
  assert.ok((await defaultPackageNames()).has("@hypit/audio-track"));
  assert.equal((await distributionEmbeddedPackageDirectories(repositoryRoot)).has("audio-track"), false);
  await writeFile(join(distribution, "package.json"), `${JSON.stringify(rootManifest, null, 2)}\n`);
  for (const entry of await readdir(join(repositoryRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "audio-track") continue;
    await symlink(join(repositoryRoot, "packages", entry.name), join(distribution, "packages", entry.name),
      process.platform === "win32" ? "junction" : "dir");
  }

  installDistributionPackageResolution([distribution]);
  const loaded = await loadNodePackageSelection(["@hypit/audio-track"], consumer, {
    fallbackRoots: [distribution],
  });
  const audioTrack = loaded.find((item) => item.specifier === "@hypit/audio-track");
  assert.ok(audioTrack);
  assert.deepEqual(audioTrack.contribution.modules?.map(({ manifest }) => [manifest.name, manifest.version]), [
    ["@hypit/audio-track", "1"],
  ]);
  assert.equal(producerPackagesFromFacets(audioTrack.contribution.facets ?? []).length, 1);
  assert.equal(refinementPackagesFromFacets(audioTrack.contribution.facets ?? []).length, 1);
  const studio = studioContributionFromPackage(
    audioTrack.specifier,
    audioTrack.contribution.facets ?? [],
  );
  assert.equal(studio.tracks.length, 1);
  assert.equal(studio.tracks[0]?.output.type.name, compositionTypes.audioTrack.name);
  assert.equal(studio.tracks[0]?.output.surface, "track");

  const lock = await readFile(join(consumer, "package-lock.json"), "utf8");
  assert.ok(lock.includes(tarball.split(/[\\/]/u).at(-1)));
  passed = true;
  console.log(`Independent Audio Track consumer passed: ${tarball}`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Independent Audio Track consumer retained at ${root}`);
}
