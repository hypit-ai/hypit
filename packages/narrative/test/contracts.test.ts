import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/protocol";
import { mediaManifest } from "@narratage/media";
import { programSpaceManifest } from "@narratage/program-space";
import { speechManifest } from "@narratage/speech";
import { speechEvidenceManifest } from "@narratage/speech-evidence";
import { semanticMapManifest } from "@narratage/semantic-map";
import { compositionManifest, compositionTypes } from "@narratage/composition";
import { visualIrManifest } from "@narratage/visual-ir";
import { narrativeManifest, narrativeManifestDigest, narrativeTypes } from "../src/index.js";

const videoDomainManifests = [narrativeManifest, mediaManifest, programSpaceManifest, speechManifest,
  speechEvidenceManifest, semanticMapManifest, visualIrManifest, compositionManifest] as const;

test("video contracts have independent physical and logical owners", () => {
  assert.deepEqual(videoDomainManifests.map((manifest) => manifest.name), [
    "@narratage/narrative",
    "@narratage/media",
    "@narratage/program-space",
    "@narratage/speech",
    "@narratage/speech-evidence",
    "@narratage/semantic-map",
    "@narratage/visual-ir",
    "@narratage/composition",
  ]);
  assert.equal(new Set(videoDomainManifests.map((manifest) => digestOf(manifest))).size, 8);
  assert.equal(narrativeManifestDigest, digestOf(narrativeManifest));
});

test("Narrative and Composition no longer share one invalidation identity", () => {
  assert.equal(narrativeTypes.narrative.module.name, narrativeManifest.name);
  assert.equal(compositionTypes.visualTrack.module.name, compositionManifest.name);
  assert.notEqual(narrativeTypes.narrative.module.name, compositionTypes.visualTrack.module.name);
  assert.equal(narrativeManifest.dependencies.length, 0);
  assert.equal(compositionManifest.dependencies.some((dependency) =>
    dependency.module.name === narrativeManifest.name), false);
});
