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
  throw new Error("Run npm run check:fine-packages.");
}

const root = await mkdtemp(join(tmpdir(), "hypit-fine-consumer-"));
const output = join(root, "packages");
const consumer = join(root, "consumer");
const distribution = join(root, "distribution");
let passed = false;
try {
  const caption = await packIndependentPackage("packages/caption-fine", output);
  const text = await packIndependentPackage("packages/text-fine", output, { buildPublicTypes: false });
  const dependencies = await packConsumerDependencies(["caption-fine", "text-fine"], output);
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    name: "fine-independent-consumer",
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
    caption,
    text,
  ], {
    cwd: consumer,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: join(root, "npm-cache") },
  });

  const installed = async (name) => {
    const packageRoot = join(consumer, "node_modules", "@hypit", name);
    return {
      root: packageRoot,
      manifest: JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")),
    };
  };
  const installedCaption = await installed("caption-fine");
  const installedText = await installed("text-fine");
  for (const item of [installedCaption, installedText]) {
    assert.equal(item.manifest.private, undefined);
    assert.equal(item.manifest.exports["."], "./dist/index.js");
    assert.equal(item.manifest.exports["./studio"], "./dist/studio.js");
    assert.equal(item.manifest.hypit.activation, "./dist/activation.js");
    const name = item.manifest.name.slice("@hypit/".length);
    assert.deepEqual(item.manifest.dependencies,
      await releasedPackageDependencyMap(`packages/${name}`, "dependencies"));
    assert.deepEqual(item.manifest.peerDependencies,
      await releasedPackageDependencyMap(`packages/${name}`, "peerDependencies"));
    await access(join(item.root, "dist", "activation.js"));
    await access(join(item.root, "dist", "studio.js"));
    await access(join(item.root, "README.md"));
    await assert.rejects(access(join(item.root, "src", "activation.ts")));
  }
  await access(join(installedCaption.root, "preview", "Track.png"));
  await access(join(installedText.root, "preview", "Track.png"));
  await access(join(installedText.root, "preview", "Mask.png"));

  await mkdir(join(distribution, "packages"), { recursive: true });
  const rootManifest = await consumerHostManifest();
  const embedded = await distributionEmbeddedPackageDirectories(repositoryRoot);
  for (const name of ["caption-fine", "text-fine"]) {
    assert.equal(rootManifest.exports[`./${name}`], undefined);
    assert.ok((await defaultPackageNames()).has(`@hypit/${name}`));
    assert.equal(embedded.has(name), false);
  }
  await writeFile(join(distribution, "package.json"), `${JSON.stringify(rootManifest, null, 2)}\n`);
  const excluded = new Set(["caption-fine", "text-fine"]);
  for (const entry of await readdir(join(repositoryRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || excluded.has(entry.name)) continue;
    await symlink(join(repositoryRoot, "packages", entry.name), join(distribution, "packages", entry.name),
      process.platform === "win32" ? "junction" : "dir");
  }

  installDistributionPackageResolution([distribution]);
  const loaded = await loadNodePackageSelection([
    "@hypit/caption-fine",
    "@hypit/text-fine",
  ], consumer, { fallbackRoots: [distribution] });
  const byName = new Map(loaded.map((item) => [item.specifier, item]));
  const captionPackage = byName.get("@hypit/caption-fine");
  const textPackage = byName.get("@hypit/text-fine");
  assert.ok(captionPackage);
  assert.ok(textPackage);
  assert.deepEqual(captionPackage.contribution.modules?.map(({ manifest }) => manifest.name), ["@hypit/caption-fine"]);
  assert.deepEqual(textPackage.contribution.modules?.map(({ manifest }) => manifest.name), ["@hypit/text-fine"]);
  assert.equal(producerPackagesFromFacets(captionPackage.contribution.facets ?? []).length, 1);
  assert.equal(refinementPackagesFromFacets(captionPackage.contribution.facets ?? []).length, 1);
  assert.equal(producerPackagesFromFacets(textPackage.contribution.facets ?? []).length, 1);
  assert.equal(refinementPackagesFromFacets(textPackage.contribution.facets ?? []).length, 0);

  const captionStudio = studioContributionFromPackage(
    captionPackage.specifier,
    captionPackage.contribution.facets ?? [],
  );
  assert.equal(captionStudio.tracks.length, 1);
  assert.equal(captionStudio.parameters.length, 1);
  assert.equal(captionStudio.tracks[0]?.output.type.name, compositionTypes.visualTrack.name);
  assert.equal(captionStudio.tracks[0]?.output.declaration, "caption");

  const textStudio = studioContributionFromPackage(
    textPackage.specifier,
    textPackage.contribution.facets ?? [],
  );
  assert.equal(textStudio.tracks.length, 3);
  assert.deepEqual(textStudio.tracks.map((track) => track.output.declaration), ["flow", "point", "path"]);
  assert.ok(textStudio.tracks.every((track) => track.output.type.name === compositionTypes.visualTrack.name));

  const reusedCaption = await import(
    "../examples/complex-explainer/packages/single-line-captions/src/activation.js"
  );
  assert.equal(producerPackagesFromFacets(reusedCaption.default.facets ?? []).length, 1);
  assert.equal(studioContributionFromPackage(
    "@explainer/single-line-captions",
    reusedCaption.default.facets ?? [],
  ).tracks.length, 1);

  const lock = await readFile(join(consumer, "package-lock.json"), "utf8");
  assert.ok(lock.includes(caption.split(/[\\/]/u).at(-1)));
  assert.ok(lock.includes(text.split(/[\\/]/u).at(-1)));
  passed = true;
  console.log(`Independent Fine consumers passed: ${caption}, ${text}`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Independent Fine consumer retained at ${root}`);
}
