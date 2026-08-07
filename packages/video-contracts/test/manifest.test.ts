import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/protocol";

import {
  compositionManifest,
  contractTypes,
  narrativeManifest,
  narrativeManifestDigest,
  videoDomainManifests,
} from "../src/index.js";

test("the physical video distribution carries six independently identified logical modules", () => {
  assert.deepEqual(videoDomainManifests.map((manifest) => manifest.name), [
    "@narratage/narrative",
    "@narratage/media",
    "@narratage/program-space",
    "@narratage/speech",
    "@narratage/semantic-time",
    "@narratage/composition",
  ]);
  assert.equal(new Set(videoDomainManifests.map((manifest) => digestOf(manifest))).size, 6);
  assert.equal(narrativeManifestDigest, digestOf(narrativeManifest));
});

test("Narrative and Composition no longer share one invalidation identity", () => {
  assert.equal(contractTypes.narrative.module.name, narrativeManifest.name);
  assert.equal(contractTypes.visualTrack.module.name, compositionManifest.name);
  assert.notEqual(contractTypes.narrative.module.name, contractTypes.visualTrack.module.name);
  assert.equal(narrativeManifest.dependencies.length, 0);
  assert.equal(compositionManifest.dependencies.some((dependency) =>
    dependency.module.name === narrativeManifest.name), false);
});
