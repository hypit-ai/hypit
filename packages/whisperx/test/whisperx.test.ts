import { sealSpeechEvidenceAudio } from "@hypit/speech";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  whisperXRequestForEvidenceAudio,
} from "@hypit/whisperx";

function evidenceAudio(): SpeechEvidenceAudio {
  return sealSpeechEvidenceAudio({
    artifact: {
      kind: "blob",
      resource: fixtureResource("whisperx-test:evidence-audio"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    sampleFrames: 16_000,
  });
}

test("WhisperX receives normalized bytes without authored Segment truth", () => {
  const valid = evidenceAudio();
  const request = whisperXRequestForEvidenceAudio(valid, { language: "es" });
  assert.equal(request.audio.resource, valid.artifact.resource);
  assert.equal("segments" in request, false);
  assert.equal(request.sampleFrames, 16_000);
  assert.equal(request.language, "es");
});
