import assert from "node:assert/strict";
import test from "node:test";

import { audiovisualTypes } from "@hypit/audiovisual";
import {
  PITCH_PRESERVING_RECONSTRUCTION_FORMAT,
  audioPreservePitchComponent,
  audioPreservePitchManifest,
  audioPreservePitchProducers,
} from "../src/index.js";

test("PreservePitch publishes one typed Signal Reconstruction Producer", async () => {
  assert.deepEqual(audioPreservePitchManifest.producers[0]?.result, {
    kind: "output", name: "reconstruction", type: audiovisualTypes.signalReconstruction,
  });
  const producer = audioPreservePitchComponent.producers.find((candidate) =>
    candidate.producer.name === audioPreservePitchProducers.preservePitch.name)!;
  const result = await producer.handler();
  assert.equal(result.kind, "output");
  assert.equal((result.value as { program?: { format?: string } }).program?.format,
    PITCH_PRESERVING_RECONSTRUCTION_FORMAT);
});
