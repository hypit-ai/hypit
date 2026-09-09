import { programSpaceSampleFrames, sealProgramSpace } from "@hypit/program-space";
import { assertSpeechEvidenceAudioIdentity, sealSpeechEvidenceAudio, speechEvidenceSampleBoundary } from "@hypit/speech";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";


test("speech evidence uses integer rational boundary projection rather than floating duration arithmetic", () => {
  assert.equal(speechEvidenceSampleBoundary(0), 0);
  assert.equal(speechEvidenceSampleBoundary(480_000), 160_000);
  assert.equal(speechEvidenceSampleBoundary(480_001), 160_000);
  assert.equal(speechEvidenceSampleBoundary(480_002), 160_001);
  const ntsc = sealProgramSpace({ id: "test-space", durationSec: 1.001,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  });
  assert.equal(programSpaceSampleFrames(ntsc, 48_000), 48_048);
});

test("SpeechEvidenceAudio carries only normalized evidence bytes and their exact sample count", () => {
  const value = sealSpeechEvidenceAudio({
    artifact: {
      kind: "blob",
      resource: fixtureResource("evidence"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    sampleFrames: 16_000,
  });
  assert.doesNotThrow(() => assertSpeechEvidenceAudioIdentity(value));
  assert.throws(
    () => assertSpeechEvidenceAudioIdentity({ ...value, sampleFrames: 0 }),
    /media identity/u,
  );
});
