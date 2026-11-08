import assert from "node:assert/strict";
import test from "node:test";

import { generationNodePackagesFromFacets } from "@hypit/generation-graph";
import { mediaTypes } from "@hypit/media";

import hypitPackage from "../src/activation.js";
import {
  speechEvidenceAudioFragment,
  speechEvidenceGenerationNodes,
  speechEvidenceProducers,
  speechEvidenceTypes,
} from "../src/index.js";

test("speech evidence contributes its media projection as an operation node", () => {
  const contributed = generationNodePackagesFromFacets(hypitPackage.facets);
  assert.equal(contributed.length, 1);
  assert.deepEqual(contributed[0]!.nodes, [{
    using: speechEvidenceGenerationNodes.projectAudio,
    fragment: speechEvidenceAudioFragment,
  }]);

  assert.deepEqual(speechEvidenceAudioFragment.inputs, [
    { name: "media", type: mediaTypes.prepared },
  ]);
  assert.deepEqual(speechEvidenceAudioFragment.operations, [{
    id: "project-audio",
    producer: speechEvidenceProducers.projectAudio,
    inputs: { media: { kind: "fragment-input", name: "media" } },
    result: { kind: "need", name: "evidenceAudio" },
  }]);
  assert.deepEqual(speechEvidenceAudioFragment.exports, [{
    name: "evidence",
    type: speechEvidenceTypes.audio,
    root: { kind: "fragment-operation", operation: "project-audio" },
  }]);
});
