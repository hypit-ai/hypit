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
import { refinementPackagesFromFacets } from "../packages/refinement/src/index.ts";
import { producerPackagesFromFacets } from "../packages/producer/src/index.ts";
import { studioContributionFromPackage } from "../packages/studio-companion/src/index.ts";

import { packConsumerDependencies, consumerHostManifest, defaultPackageNames } from "./independent-consumer.mjs";

import { packIndependentPackage, releasedPackageDependencyMap } from "./pack-independent-package.mjs";
import { distributionEmbeddedPackageDirectories } from "./distribution-ownership.mjs";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli?.endsWith("npm-cli.js")) {
  throw new Error("Run npm run check:author-packages.");
}

const names = ["timeline-author", "script", "film", "image-operations", "media-operations", "html-video"];
const root = await mkdtemp(join(tmpdir(), "hypit-author-package-consumer-"));
const output = join(root, "packages");
const consumer = join(root, "consumer");
const distribution = join(root, "distribution");
let passed = false;
try {
  const tarballs = [];
  for (const [index, name] of names.entries()) {
    tarballs.push(await packIndependentPackage(`packages/${name}`, output, { buildPublicTypes: index === 0 }));
  }
  const dependencies = await packConsumerDependencies(names, output);
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    name: "author-packages-independent-consumer",
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
    ...tarballs,
  ], {
    cwd: consumer,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: join(root, "npm-cache") },
  });

  for (const name of names) {
    const packageRoot = join(consumer, "node_modules", "@hypit", name);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    assert.equal(manifest.private, undefined);
    assert.equal(manifest.exports["."], "./dist/index.js");
    assert.equal(manifest.hypit.activation, "./dist/activation.js");
    assert.deepEqual(manifest.dependencies,
      await releasedPackageDependencyMap(`packages/${name}`, "dependencies"));
    assert.deepEqual(manifest.peerDependencies,
      await releasedPackageDependencyMap(`packages/${name}`, "peerDependencies"));
    await access(join(packageRoot, "dist", "activation.js"));
    await access(join(packageRoot, "README.md"));
    await assert.rejects(access(join(packageRoot, "src", "activation.ts")));
    if (name === "script" || name === "film") {
      assert.equal(manifest.exports["./studio"], "./dist/studio.js");
      await access(join(packageRoot, "dist", "studio.js"));
    } else {
      assert.equal(manifest.exports["./studio"], undefined);
    }
  }

  await mkdir(join(distribution, "packages"), { recursive: true });
  const rootManifest = await consumerHostManifest();
  const embedded = await distributionEmbeddedPackageDirectories(repositoryRoot);
  for (const name of names) {
    assert.equal(rootManifest.exports[`./${name}`], undefined);
    assert.ok((await defaultPackageNames()).has(`@hypit/${name}`));
    assert.equal(embedded.has(name), false);
  }
  await writeFile(join(distribution, "package.json"), `${JSON.stringify(rootManifest, null, 2)}\n`);
  const excluded = new Set(names);
  for (const entry of await readdir(join(repositoryRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || excluded.has(entry.name)) continue;
    await symlink(join(repositoryRoot, "packages", entry.name), join(distribution, "packages", entry.name),
      process.platform === "win32" ? "junction" : "dir");
  }

  installDistributionPackageResolution([distribution]);
  const loaded = await loadNodePackageSelection(
    names.map((name) => `@hypit/${name}`),
    consumer,
    { fallbackRoots: [distribution] },
  );
  const byName = new Map(loaded.map((item) => [item.specifier, item]));
  const timeline = byName.get("@hypit/timeline-author");
  const script = byName.get("@hypit/script");
  const film = byName.get("@hypit/film");
  const imageOperations = byName.get("@hypit/image-operations");
  const mediaOperations = byName.get("@hypit/media-operations");
  const htmlVideo = byName.get("@hypit/html-video");
  assert.ok(timeline);
  assert.ok(script);
  assert.ok(film);
  assert.ok(imageOperations);
  assert.ok(mediaOperations);
  assert.ok(htmlVideo);
  assert.deepEqual(timeline.contribution.modules?.map(({ manifest }) => manifest.name), ["@hypit/timeline-author"]);
  assert.deepEqual(script.contribution.modules?.map(({ manifest }) => manifest.name), ["@hypit/script"]);
  assert.deepEqual(film.contribution.modules?.map(({ manifest }) => manifest.name), ["@hypit/film"]);
  assert.deepEqual(imageOperations.contribution.modules?.map(({ manifest }) => manifest.name),
    ["@hypit/image-operations"]);
  assert.deepEqual(mediaOperations.contribution.modules?.map(({ manifest }) => manifest.name),
    ["@hypit/media-operations"]);
  assert.deepEqual(htmlVideo.contribution.modules?.map(({ manifest }) => manifest.name), ["@hypit/html-video"]);
  const producerPackages = (item) => producerPackagesFromFacets(item.contribution.facets ?? []);
  const refinementPackages = (item) => refinementPackagesFromFacets(item.contribution.facets ?? []);
  assert.equal(producerPackages(timeline).length, 1);
  assert.equal(refinementPackages(timeline).length, 0);
  assert.equal(producerPackages(script).length, 0);
  assert.equal(refinementPackages(script).length, 0);
  assert.equal(producerPackages(film).length, 1);
  assert.equal(refinementPackages(film).length, 1);
  assert.equal(producerPackages(imageOperations).length, 2);
  assert.equal(refinementPackages(imageOperations).length, 2);
  assert.equal(producerPackages(mediaOperations).length, 1);
  assert.equal(refinementPackages(mediaOperations).length, 1);
  assert.equal(producerPackages(htmlVideo).length, 0);
  assert.equal(refinementPackages(htmlVideo).length, 0);

  const scriptStudio = studioContributionFromPackage(script.specifier, script.contribution.facets ?? []);
  const filmStudio = studioContributionFromPackage(film.specifier, film.contribution.facets ?? []);
  assert.equal(scriptStudio.temporalDomains.length, 1);
  assert.equal(scriptStudio.temporalDomains[0]?.id, "@hypit/script#script");
  assert.equal(filmStudio.films.length, 1);
  assert.equal(filmStudio.films[0]?.id, "@hypit/film#film");

  const lock = await readFile(join(consumer, "package-lock.json"), "utf8");
  for (const tarball of tarballs) assert.ok(lock.includes(tarball.split(/[\\/]/u).at(-1)));
  passed = true;
  console.log(`Independent author package consumers passed: ${tarballs.join(", ")}`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Independent author package consumer retained at ${root}`);
}
