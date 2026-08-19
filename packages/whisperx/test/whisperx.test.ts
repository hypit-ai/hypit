import {
  registerProducerFacets,
} from "@hypit/component-kit";
import type { ProducerRegistrar } from "@hypit/component-kit";
import { sealProgramSpace } from "@hypit/program-space";
import { sealSpeechBasis, sealSpeechEvidenceAudio } from "@hypit/speech";
import type { SpeechBasis, SpeechEvidenceAudio } from "@hypit/speech";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import type { Digest, ProducerRef } from "@hypit/protocol";
import {
  whisperXComponent,
  whisperXProducers,
  whisperXRequestForEvidenceAudio,
} from "@hypit/whisperx";

function basis() {
  const programSpace = sealProgramSpace({
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  return sealSpeechBasis({
    programSpace,
    audio: { kind: "blob", digest: fixtureDigest("whisperx-test:audio"), size: 1, mediaType: "audio/wav" },
    visualTrack: { clips: [] },
    segments: [{ segmentId: "line", startFrame: 0, endFrameExclusive: 30 }],
  });
}

function evidenceAudio(basis: SpeechBasis): SpeechEvidenceAudio {
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
  const source = basis();
  const valid = evidenceAudio(source);
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
