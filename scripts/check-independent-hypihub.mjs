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

import { packConsumerDependencies, consumerHostManifest } from "./independent-consumer.mjs";

import { packIndependentPackage, releasedPackageDependencyMap } from "./pack-independent-package.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli?.endsWith("npm-cli.js")) throw new Error("Run npm run check:hypihub-package.");

const root = await mkdtemp(join(tmpdir(), "hypit-hypihub-consumer-"));
const output = join(root, "packages");
const consumer = join(root, "consumer");
const distribution = join(root, "distribution");
let passed = false;
try {
  const mediaExtraction = await packIndependentPackage("packages/media-extraction", output);
  const stillVideo = await packIndependentPackage("packages/still-video", output, { buildPublicTypes: false });
  const mediaLocal = await packIndependentPackage("packages/media-local", output, { buildPublicTypes: false });
  const narrativeSpeechAlignment = await packIndependentPackage(
    "packages/narrative-speech-alignment",
    output,
    { buildPublicTypes: false },
  );
  const whisperx = await packIndependentPackage("packages/whisperx", output, { buildPublicTypes: false });
  const provider = await packIndependentPackage("packages/provider-hypihub", output, { buildPublicTypes: false });
  const dependencies = await packConsumerDependencies([
    "media-extraction", "still-video", "media-local",
    "narrative-speech-alignment", "whisperx", "provider-hypihub",
  ], output);
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    name: "hypihub-independent-consumer",
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
    mediaExtraction,
    stillVideo,
    mediaLocal,
    narrativeSpeechAlignment,
    whisperx,
    provider,
  ], {
    cwd: consumer,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_cache: join(root, "npm-cache"),
      npm_config_update_notifier: "false",
    },
  });

  const providerRoot = join(consumer, "node_modules", "@hypit", "provider-hypihub");
  const providerManifest = JSON.parse(await readFile(join(providerRoot, "package.json"), "utf8"));
  assert.equal(providerManifest.private, undefined);
  assert.equal(providerManifest.exports["."], "./dist/index.js");
  assert.equal(providerManifest.hypit.activation, "./dist/activation.js");
  assert.deepEqual(providerManifest.dependencies,
    await releasedPackageDependencyMap("packages/provider-hypihub", "dependencies"));
  assert.deepEqual(providerManifest.peerDependencies,
    await releasedPackageDependencyMap("packages/provider-hypihub", "peerDependencies"));
  await access(join(providerRoot, "dist", "activation.js"));
  await access(join(providerRoot, "LICENSE"));
  await assert.rejects(access(join(providerRoot, "src", "activation.ts")));

  const whisperXRoot = join(consumer, "node_modules", "@hypit", "whisperx");
  const whisperXManifest = JSON.parse(await readFile(join(whisperXRoot, "package.json"), "utf8"));
  assert.equal(whisperXManifest.private, undefined);
  assert.equal(whisperXManifest.exports["."], "./dist/index.js");
  assert.deepEqual(whisperXManifest.dependencies,
    await releasedPackageDependencyMap("packages/whisperx", "dependencies"));
  assert.deepEqual(whisperXManifest.peerDependencies,
    await releasedPackageDependencyMap("packages/whisperx", "peerDependencies"));
  await access(join(whisperXRoot, "dist", "activation.js"));

  await mkdir(join(distribution, "packages"), { recursive: true });
  await writeFile(join(distribution, "package.json"), JSON.stringify(await consumerHostManifest()));
  for (const entry of await readdir(join(repositoryRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || [
      "media-local",
      "media-extraction",
      "still-video",
      "narrative-speech-alignment",
      "provider-hypihub",
      "whisperx",
    ].includes(entry.name)) continue;
    await symlink(join(repositoryRoot, "packages", entry.name), join(distribution, "packages", entry.name),
      process.platform === "win32" ? "junction" : "dir");
  }

  installDistributionPackageResolution([distribution]);
  const loaded = await loadNodePackageSelection([
    "@hypit/provider-hypihub",
    "@hypit/whisperx",
  ], consumer, { fallbackRoots: [distribution] });
  assert.ok(loaded.some((item) => item.specifier === "@hypit/provider-hypihub"
    && item.contribution.facets?.length === 1));
  assert.ok(loaded.some((item) => item.specifier === "@hypit/whisperx"
    && item.contribution.modules?.[0]?.manifest.name === "@hypit/whisperx"));

  const lock = await readFile(join(consumer, "package-lock.json"), "utf8");
  for (const tarball of [provider, whisperx, mediaLocal, mediaExtraction, stillVideo, narrativeSpeechAlignment]) {
    assert.ok(lock.includes(tarball.split(/[\\/]/u).at(-1)));
  }
  passed = true;
  console.log(`Independent HypiHub consumer passed: ${provider}, ${whisperx}`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Independent HypiHub consumer retained at ${root}`);
}
