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
  captionComponent,
  captionManifest,
} from "@svml/caption";
import { generationComponent } from "@svml/generation";
import {
  createNodePackageLock,
  collectNodePackageComponents,
  loadNodePackageContributions,
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
import { seedanceComponent } from "@svml/seedance";

import { svmlPackage } from "../src/index.js";

test("the official prelude activates SpeechTake compute without teaching the Host its name", () => {
  const components = collectNodePackageComponents([svmlPackage]);
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
  const components = collectNodePackageComponents([svmlPackage]);
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

test("the official prelude activates Caption compute and owner validators without Host special cases", () => {
  const components = collectNodePackageComponents([svmlPackage]);
  assert.equal(
    svmlPackage.modules?.some((module) => module.manifest === captionManifest),
    true,
  );
  assert.equal(components.includes(captionComponent), true);
  assert.deepEqual(
    captionComponent.producers.map((facet) => facet.producer.name),
    ["temporalize-caption", "temporalize-caption-plan", "render-caption-program", "render-caption-track"],
  );
  assert.deepEqual(
    captionComponent.validators?.map((facet) => facet.type.name),
    ["CaptionStyle", "CaptionProgram", "CaptionPlan", "TimedCaptionProjection", "CaptionTrackProgram"],
  );
});

test("the installed official package lock physically contains speech and Caption compute", async () => {
  const directory = await mkdtemp(join(tmpdir(), "svml-prelude-lock-"));
  const lockPath = join(directory, "svml.packages.lock");
  const installedRoot = fileURLToPath(new URL("../../cli/", import.meta.url));
  try {
    const lock = await createNodePackageLock(["@svml/prelude-video"], installedRoot);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/speech-take"), true);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/speech-align"), true);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/caption"), true);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/media"), true);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/generation"), true);
    assert.equal(lock.artifacts.some((artifact) => artifact.name === "@svml/seedance"), true);
    await writeNodePackageLock(lockPath, lock);
    const packages = await loadNodePackageContributions(lockPath, installedRoot);
    const components = collectNodePackageComponents(packages);
    assert.equal(components.some((component) => component.name === "@svml/speech-take"), true);
    assert.equal(components.some((component) => component.name === "@svml/speech-align"), true);
    assert.equal(components.some((component) => component.name === "@svml/caption"), true);
    assert.equal(components.includes(generationComponent), true);
    assert.equal(components.includes(seedanceComponent), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
