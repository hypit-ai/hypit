import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@svml/protocol";

import {
  compositionManifest,
  contractTypes,
  narrativeManifest,
  narrativeManifestDigest,
  videoContractManifests,
} from "../src/index.js";

test("the physical video distribution carries six independently identified logical modules", () => {
  assert.deepEqual(videoContractManifests.map((manifest) => manifest.name), [
    "@svml/narrative",
    "@svml/media",
    "@svml/program-space",
    "@svml/speech",
    "@svml/semantic-time",
    "@svml/composition",
  ]);
  assert.equal(new Set(videoContractManifests.map((manifest) => digestOf(manifest))).size, 6);
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
