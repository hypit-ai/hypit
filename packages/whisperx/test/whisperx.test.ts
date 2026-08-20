import {
  registerProducerFacets,
} from "@hypit/component-kit";
import type { ProducerRegistrar } from "@hypit/component-kit";
import { sealSpeechEvidenceAudio } from "@hypit/speech";
import type { SpeechEvidenceAudio } from "@hypit/speech";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import type { Digest, ProducerRef } from "@hypit/protocol";
import {
  whisperXComponent,
  whisperXProducers,
  whisperXRequestForEvidenceAudio,
} from "@hypit/whisperx";

function evidenceAudio(): SpeechEvidenceAudio {
  return sealSpeechEvidenceAudio({
    artifact: {
      kind: "blob",
      digest: fixtureDigest("whisperx-test:evidence-audio"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    sampleFrames: 16_000,
  });
}

test("WhisperX receives normalized bytes without authored Segment truth", () => {
  const valid = evidenceAudio();
  const request = whisperXRequestForEvidenceAudio(valid);
  assert.equal(request.audio.digest, valid.artifact.digest);
  assert.equal("segments" in request, false);
  assert.equal(request.sampleFrames, 16_000);
});

test("WhisperX installs into the host-neutral compute port without a Node Driver", () => {
  const registrations: ProducerRef[] = [];
  const registrar: ProducerRegistrar = {
    registerProducer(producer) {
      registrations.push(producer);
    },
  };

  registerProducerFacets(registrar, whisperXComponent.producers);

  assert.deepEqual(registrations, [whisperXProducers.request]);
});
