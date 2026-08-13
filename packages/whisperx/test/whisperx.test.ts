import {
  registerProducerFacets,
} from "@narratage/component-kit";
import type { ProducerRegistrar } from "@narratage/component-kit";
import { sealProgramSpace } from "@narratage/program-space";
import { sealSpeechBasis, sealSpeechEvidenceAudio } from "@narratage/speech";
import type { SpeechBasis, SpeechEvidenceAudio } from "@narratage/speech";
import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/protocol";
import type { Digest, ProducerRef } from "@narratage/protocol";
import {
  whisperXComponent,
  whisperXProducers,
  whisperXRequestForEvidenceAudio,
} from "@narratage/whisperx";

function basis() {
  const programSpace = sealProgramSpace({
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  return sealSpeechBasis({
    programSpace,
    audio: { kind: "blob", digest: digestOf("whisperx-test:audio"), size: 1, mediaType: "audio/wav" },
    visualTrack: { clips: [] },
    segments: [{ segmentId: "line", startFrame: 0, endFrameExclusive: 30 }],
  });
}

function evidenceAudio(basis: SpeechBasis): SpeechEvidenceAudio {
  return sealSpeechEvidenceAudio({
    artifact: {
      kind: "blob",
      digest: digestOf("whisperx-test:evidence-audio"),
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
  const registrations: { readonly producer: ProducerRef; readonly digest: Digest }[] = [];
  const registrar: ProducerRegistrar = {
    registerProducer(producer, implementationDigest) {
      registrations.push({ producer, digest: implementationDigest });
    },
  };

  registerProducerFacets(registrar, whisperXComponent.producers);

  assert.deepEqual(registrations.map((item) => item.producer), [whisperXProducers.request]);
});
