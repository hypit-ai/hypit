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
  throw new Error("Run npm run check:visual-track-package.");
}

const root = await mkdtemp(join(tmpdir(), "hypit-visual-track-consumer-"));
const output = join(root, "packages");
const consumer = join(root, "consumer");
const distribution = join(root, "distribution");
let passed = false;
try {
  const trackTarball = await packIndependentPackage("packages/visual-track", output);
  const transitionTarball = await packIndependentPackage("packages/visual-transition", output, { buildPublicTypes: false });
  const adjustmentTarball = await packIndependentPackage("packages/visual-adjustment", output, { buildPublicTypes: false });
  const treatmentTarball = await packIndependentPackage("packages/visual-treatment", output, { buildPublicTypes: false });
  const dependencies = await packConsumerDependencies([
    "visual-track", "visual-transition", "visual-adjustment", "visual-treatment",
  ], output);
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), `${JSON.stringify({
    name: "visual-track-independent-consumer",
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
    trackTarball,
    transitionTarball,
    adjustmentTarball,
    treatmentTarball,
  ], {
    cwd: consumer,
    stdio: "inherit",
    env: { ...process.env, npm_config_cache: join(root, "npm-cache") },
  });

  const installedRoot = join(consumer, "node_modules", "@hypit", "visual-track");
  const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
  assert.equal(installedManifest.private, undefined);
  assert.equal(installedManifest.exports["."], "./dist/index.js");
  assert.equal(installedManifest.exports["./studio"], "./dist/studio.js");
  assert.equal(installedManifest.hypit.activation, "./dist/activation.js");
  assert.deepEqual(installedManifest.dependencies,
    await releasedPackageDependencyMap("packages/visual-track", "dependencies"));
  assert.deepEqual(installedManifest.peerDependencies,
    await releasedPackageDependencyMap("packages/visual-track", "peerDependencies"));
  await access(join(installedRoot, "dist", "activation.js"));
  await access(join(installedRoot, "dist", "studio.js"));
  await access(join(installedRoot, "README.md"));
  await assert.rejects(access(join(installedRoot, "src", "activation.ts")));

  const installedTransitionRoot = join(consumer, "node_modules", "@hypit", "visual-transition");
  const installedTransitionManifest = JSON.parse(await readFile(join(installedTransitionRoot, "package.json"), "utf8"));
  assert.equal(installedTransitionManifest.private, undefined);
  assert.equal(installedTransitionManifest.exports["."], "./dist/index.js");
  assert.equal(installedTransitionManifest.exports["./studio"], "./dist/studio.js");
  assert.equal(installedTransitionManifest.hypit.activation, "./dist/activation.js");
  assert.deepEqual(installedTransitionManifest.dependencies,
    await releasedPackageDependencyMap("packages/visual-transition", "dependencies"));
  assert.deepEqual(installedTransitionManifest.peerDependencies,
    await releasedPackageDependencyMap("packages/visual-transition", "peerDependencies"));
  await access(join(installedTransitionRoot, "dist", "activation.js"));
  await access(join(installedTransitionRoot, "dist", "studio.js"));
  await access(join(installedTransitionRoot, "README.md"));
  await assert.rejects(access(join(installedTransitionRoot, "src", "activation.ts")));

  for (const packageName of ["visual-adjustment", "visual-treatment"]) {
    const installedRoot = join(consumer, "node_modules", "@hypit", packageName);
    const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
    assert.equal(installedManifest.private, undefined);
    assert.equal(installedManifest.exports["."], "./dist/index.js");
    assert.equal(installedManifest.exports["./studio"], "./dist/studio.js");
    assert.equal(installedManifest.hypit.activation, "./dist/activation.js");
    assert.deepEqual(installedManifest.dependencies,
      await releasedPackageDependencyMap(`packages/${packageName}`, "dependencies"));
    assert.deepEqual(installedManifest.peerDependencies,
      await releasedPackageDependencyMap(`packages/${packageName}`, "peerDependencies"));
    await access(join(installedRoot, "dist", "activation.js"));
    await access(join(installedRoot, "dist", "studio.js"));
    await access(join(installedRoot, "README.md"));
    await assert.rejects(access(join(installedRoot, "src", "activation.ts")));
  }

  await mkdir(join(distribution, "packages"), { recursive: true });
  const rootManifest = await consumerHostManifest();
  assert.equal(rootManifest.exports["./visual-track"], undefined);
  assert.ok((await defaultPackageNames()).has("@hypit/visual-track"));
  assert.ok((await defaultPackageNames()).has("@hypit/visual-transition"));
  assert.ok((await defaultPackageNames()).has("@hypit/visual-adjustment"));
  assert.ok((await defaultPackageNames()).has("@hypit/visual-treatment"));
  assert.equal((await distributionEmbeddedPackageDirectories(repositoryRoot)).has("visual-track"), false);
  assert.equal((await distributionEmbeddedPackageDirectories(repositoryRoot)).has("visual-transition"), false);
  assert.equal((await distributionEmbeddedPackageDirectories(repositoryRoot)).has("visual-adjustment"), false);
  assert.equal((await distributionEmbeddedPackageDirectories(repositoryRoot)).has("visual-treatment"), false);
  await writeFile(join(distribution, "package.json"), `${JSON.stringify(rootManifest, null, 2)}\n`);
  for (const entry of await readdir(join(repositoryRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory() || ["visual-track", "visual-transition", "visual-adjustment", "visual-treatment"].includes(entry.name)) continue;
    await symlink(join(repositoryRoot, "packages", entry.name), join(distribution, "packages", entry.name),
      process.platform === "win32" ? "junction" : "dir");
  }

  installDistributionPackageResolution([distribution]);
  const loaded = await loadNodePackageSelection([
    "@hypit/visual-track", "@hypit/visual-transition", "@hypit/visual-adjustment", "@hypit/visual-treatment",
  ], consumer, {
    fallbackRoots: [distribution],
  });
  const visualTrack = loaded.find((item) => item.specifier === "@hypit/visual-track");
  assert.ok(visualTrack);
  assert.deepEqual(visualTrack.contribution.modules?.map(({ manifest }) => [manifest.name, manifest.version]), [
    ["@hypit/visual-track", "1"],
  ]);
  assert.equal(producerPackagesFromFacets(visualTrack.contribution.facets ?? []).length, 1);
  assert.equal(refinementPackagesFromFacets(visualTrack.contribution.facets ?? []).length, 1);
  const studio = studioContributionFromPackage(
    visualTrack.specifier,
    visualTrack.contribution.facets ?? [],
  );
  assert.equal(studio.tracks.length, 1);
  assert.equal(studio.tracks[0]?.output.type.name, compositionTypes.visualTrack.name);
  assert.equal(studio.tracks[0]?.output.declaration, "track");

  const visualTransition = loaded.find((item) => item.specifier === "@hypit/visual-transition");
  assert.ok(visualTransition);
  assert.deepEqual(visualTransition.contribution.modules?.map(({ manifest }) => [manifest.name, manifest.version]), [
    ["@hypit/visual-transition", "1"],
  ]);
  assert.equal(producerPackagesFromFacets(visualTransition.contribution.facets ?? []).length, 0);
  assert.equal(refinementPackagesFromFacets(visualTransition.contribution.facets ?? []).length, 0);
  const transitionStudio = studioContributionFromPackage(
    visualTransition.specifier,
    visualTransition.contribution.facets ?? [],
  );
  assert.equal(transitionStudio.tracks.length, 0);
  assert.deepEqual(transitionStudio.parameters.map(({ match }) => match.declaration), [
    "cross-dissolve",
    "dip-to-color",
    "push",
    "slide",
    "linear-wipe",
    "iris",
    "zoom-dissolve",
    "blur-dissolve",
  ]);

  const visualAdjustment = loaded.find((item) => item.specifier === "@hypit/visual-adjustment");
  assert.ok(visualAdjustment);
  assert.deepEqual(visualAdjustment.contribution.modules?.map(({ manifest }) => [manifest.name, manifest.version]), [
    ["@hypit/visual-adjustment", "1"],
  ]);
  assert.equal(producerPackagesFromFacets(visualAdjustment.contribution.facets ?? []).length, 1);
  assert.equal(refinementPackagesFromFacets(visualAdjustment.contribution.facets ?? []).length, 1);
  const adjustmentStudio = studioContributionFromPackage(
    visualAdjustment.specifier,
    visualAdjustment.contribution.facets ?? [],
  );
  assert.equal(adjustmentStudio.tracks.length, 1);
  assert.equal(adjustmentStudio.parameters.length, 0);

  const visualTreatment = loaded.find((item) => item.specifier === "@hypit/visual-treatment");
  assert.ok(visualTreatment);
  assert.deepEqual(visualTreatment.contribution.modules?.map(({ manifest }) => [manifest.name, manifest.version]), [
    ["@hypit/visual-treatment", "1"],
  ]);
  assert.equal(producerPackagesFromFacets(visualTreatment.contribution.facets ?? []).length, 0);
  assert.equal(refinementPackagesFromFacets(visualTreatment.contribution.facets ?? []).length, 0);
  const treatmentStudio = studioContributionFromPackage(
    visualTreatment.specifier,
    visualTreatment.contribution.facets ?? [],
  );
  assert.equal(treatmentStudio.tracks.length, 0);
  assert.deepEqual(treatmentStudio.parameters.map(({ match }) => match.declaration), [
    "transform", "opacity", "blur", "color",
  ]);

  const lock = await readFile(join(consumer, "package-lock.json"), "utf8");
  assert.ok(lock.includes(trackTarball.split(/[\\/]/u).at(-1)));
  assert.ok(lock.includes(transitionTarball.split(/[\\/]/u).at(-1)));
  assert.ok(lock.includes(adjustmentTarball.split(/[\\/]/u).at(-1)));
  assert.ok(lock.includes(treatmentTarball.split(/[\\/]/u).at(-1)));
  passed = true;
  console.log(`Independent Visual stack consumer passed: ${trackTarball}, ${transitionTarball}, ${adjustmentTarball}, ${treatmentTarball}`);
} finally {
  if (passed) await rm(root, { recursive: true, force: true });
  else console.error(`Independent Visual Track consumer retained at ${root}`);
}
