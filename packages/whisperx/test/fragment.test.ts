import assert from "node:assert/strict";
import test from "node:test";

import { generationNodePackagesFromFacets } from "@hypit/generation-graph";
import { speechEvidenceTypes } from "@hypit/speech-evidence";
import { timedTranscriptTypes } from "@hypit/timed-transcript";

import hypitPackage from "../src/activation.js";
import {
  whisperXGenerationNodes,
  whisperXProducers,
  whisperXTranscriptionFragment,
  whisperXTypes,
} from "../src/index.js";

test("WhisperX contributes a Provider-neutral transcript operation node", () => {
  const contributed = generationNodePackagesFromFacets(hypitPackage.facets);
  assert.equal(contributed.length, 1);
  assert.deepEqual(contributed[0]!.nodes, [{
    using: whisperXGenerationNodes.transcribe,
    fragment: whisperXTranscriptionFragment,
  }]);

  assert.deepEqual(whisperXTranscriptionFragment.inputs, [
    { name: "evidence", type: speechEvidenceTypes.audio },
    { name: "language", type: whisperXTypes.language },
  ]);
  assert.deepEqual(whisperXTranscriptionFragment.operations, [{
    id: "transcribe",
    producer: whisperXProducers.request,
    inputs: {
      evidence: { kind: "fragment-input", name: "evidence" },
      language: { kind: "fragment-input", name: "language" },
    },
    result: { kind: "need", name: "transcript" },
  }]);
  assert.deepEqual(whisperXTranscriptionFragment.exports, [{
    name: "transcript",
    type: timedTranscriptTypes.transcript,
    root: { kind: "fragment-operation", operation: "transcribe" },
  }]);
});
