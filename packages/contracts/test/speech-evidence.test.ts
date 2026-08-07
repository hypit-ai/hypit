import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSpeechEvidenceAudioIdentity,
  programSpaceSampleFrames,
  sealProgramSpace,
  sealSpeechEvidenceAudio,
  speechEvidenceSampleBoundary,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";

test("speech evidence uses integer rational boundary projection rather than floating duration arithmetic", () => {
  assert.equal(speechEvidenceSampleBoundary(0), 0);
  assert.equal(speechEvidenceSampleBoundary(480_000), 160_000);
  assert.equal(speechEvidenceSampleBoundary(480_001), 160_000);
  assert.equal(speechEvidenceSampleBoundary(480_002), 160_001);
  const ntsc = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 1.001,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  assert.equal(programSpaceSampleFrames(ntsc, 48_000), 48_048);
});

test("SpeechEvidenceAudio records evidence bytes and the complete source-to-evidence sample map", () => {
  const value = sealSpeechEvidenceAudio({
    contract: "svml.speech-evidence-audio@1",
    artifact: {
      kind: "blob",
      digest: digestOf("evidence"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    codec: "pcm_s16le",
    sampleRate: 16_000,
    channels: 1,
    sampleFrames: 16_000,
    durationSec: 1,
    segments: [{ segmentId: "line", startSec: 0, endSec: 1 }],
    sampleMap: {
      algorithm: "rational-boundary-round@1",
      sourceSampleRate: 48_000,
      evidenceSampleRate: 16_000,
      sourceSampleFrames: 48_000,
      evidenceSampleFrames: 16_000,
      sourceOriginSample: 0,
      evidenceOriginSample: 0,
    },
  });
  assert.doesNotThrow(() => assertSpeechEvidenceAudioIdentity(value));
  assert.throws(
    () => assertSpeechEvidenceAudioIdentity({ ...value, sampleFrames: 16_001 }),
    /sample map|digest/u,
  );
});
