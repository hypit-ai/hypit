import {
  registerProducerFacets,
} from "@narratage/component-kit";
import type { ProducerRegistrar } from "@narratage/component-kit";
import { sealProgramSpace } from "@narratage/program-space";
import { sealSpeechBasis, sealSpeechEvidenceAudio } from "@narratage/speech";
import type { SpeechAudioBasis, SpeechBasis, SpeechEvidenceAudio } from "@narratage/speech";
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
    segments: [{ segmentId: "line", startSec: 0, endSec: 1 }],
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

function audioBasis(value: SpeechBasis): SpeechAudioBasis {
  return {
    programSpace: value.programSpace,
    audio: value.audio,
    segments: value.segments,
  };
}

test("WhisperX receives normalized bytes and Segment truth through separate graph inputs", () => {
  const source = basis();
  const valid = evidenceAudio(source);
  const request = whisperXRequestForEvidenceAudio(valid, audioBasis(source));
  assert.equal(request.audio.digest, valid.artifact.digest);
  assert.deepEqual(request.segments, source.segments);
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
