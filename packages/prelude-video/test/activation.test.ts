import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createNodePackageLock,
  loadNodePackages,
  nodePackageComponents,
  writeNodePackageLock,
} from "@svml/package-loader-node";
import {
  speechAlignComponent,
  speechAlignManifest,
} from "@svml/speech-align";
import {
  speechTakeComponent,
  speechTakeManifest,
} from "@svml/speech-take";

import { svmlPackage } from "../src/index.js";

test("the official prelude activates SpeechTake compute without teaching the Host its name", () => {
  const components = nodePackageComponents([svmlPackage]);
  assert.equal(
    svmlPackage.modules?.some((module) => module.manifest === speechTakeManifest),
    true,
  );
  assert.equal(components.includes(speechTakeComponent), true);
  assert.deepEqual(
    speechTakeComponent.producers.map((facet) => facet.producer.name).sort(),
    ["project-audio", "project-audio-track", "project-program-space", "project-visual"],
  );
});

test("the official prelude activates Speech Align compute without teaching the Host its name", () => {
  const components = nodePackageComponents([svmlPackage]);
  assert.equal(
    svmlPackage.modules?.some((module) => module.manifest === speechAlignManifest),
    true,
  );
  assert.equal(components.includes(speechAlignComponent), true);
  assert.deepEqual(
    speechAlignComponent.producers.map((facet) => facet.producer.name),
    ["locate-speech"],
  );
});

test("the installed official package lock physically contains deterministic speech compute", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-prelude-lock-"));
  const lockPath = join(directory, "svml.packages.lock");
  const installedRoot = fileURLToPath(new URL("../../cli/", import.meta.url));
  try {
    const lock = await createNodePackageLock(["@svml/prelude-video"], installedRoot);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/speech-take"), true);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/speech-align"), true);
    await writeNodePackageLock(lockPath, lock);
    const packages = await loadNodePackages(lockPath, installedRoot);
    const components = nodePackageComponents(packages);
    assert.equal(components.some((component) => component.name === "@svml/speech-take"), true);
    assert.equal(components.some((component) => component.name === "@svml/speech-align"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
