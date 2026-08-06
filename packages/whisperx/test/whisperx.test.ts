import assert from "node:assert/strict";
import test from "node:test";

import {
  registerProducerFacets,
} from "@svml/component-kit";
import type { ProducerRegistrar } from "@svml/component-kit";
import { sealProgramSpace, sealSpeechBasis, sealSpeechEvidenceAudio } from "@svml/contracts";
import type { SpeechBasis, SpeechEvidenceAudio } from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { Digest, ProducerRef } from "@svml/protocol";
import {
  normalizeWhisperXAlignment,
  sealWhisperXAlignmentEvidence,
  whisperXComponent,
  whisperXProducers,
  whisperXRequestForEvidenceAudio,
} from "@svml/whisperx";

function basis() {
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const visual = digestOf("whisperx-test:visual");
  return sealSpeechBasis({
    contract: "svml.speech-basis@1",
    narrativeDigest: digestOf("whisperx-test:narrative"),
    programSpace,
    audio: { digest: digestOf("whisperx-test:audio"), size: 1, mediaType: "audio/wav", durationSec: 1 },
    visualTrack: { clips: [{
      segmentId: "line",
      artifact: { digest: visual, size: 1, mediaType: "video/mp4", durationSec: 1 },
      startSec: 0,
      endSec: 1,
    }] },
    segments: [{ segmentId: "line", startSec: 0, endSec: 1, sourceArtifactDigest: visual }],
  });
}

function evidenceAudio(basis: SpeechBasis): SpeechEvidenceAudio {
  return sealSpeechEvidenceAudio({
    contract: "svml.speech-evidence-audio@1",
    basisDigest: basis.basisDigest,
    narrativeDigest: basis.narrativeDigest,
    programSpaceDigest: basis.programSpace.digest,
    sourceAudioArtifactDigest: basis.audio.digest,
    artifact: {
      kind: "blob",
      digest: digestOf("whisperx-test:evidence-audio"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    codec: "pcm_s16le",
    sampleRate: 16_000,
    channels: 1,
    sampleFrames: 16_000,
    durationSec: 1,
    segments: basis.segments,
    sampleMap: {
      algorithm: "rational-boundary-round@1",
      sourceSampleRate: 48_000,
      evidenceSampleRate: 16_000,
      sourceSampleFrames: 48_000,
      evidenceSampleFrames: 16_000,
      sourceOriginSample: 0,
      evidenceOriginSample: 0,
      resamplerImplementation: "fixture",
    },
  });
}

test("WhisperX consumes only the canonical 16 kHz evidence projection", () => {
  const valid = evidenceAudio(basis());
  assert.equal(whisperXRequestForEvidenceAudio(valid).basisDigest, valid.basisDigest);
  const tampered = { ...valid, sampleFrames: 16_001 };
  assert.throws(() => whisperXRequestForEvidenceAudio(tampered), /sample map|digest/u);
});

test("WhisperX normalization verifies its model-specific result before lowering to common Evidence", () => {
  const source = basis();
  const measured = sealWhisperXAlignmentEvidence({
    contract: "svml.whisperx-alignment-evidence@2",
    engine: "whisperx",
    basisDigest: source.basisDigest,
    audioArtifactDigest: source.audio.digest,
    evidenceAudioDigest: evidenceAudio(source).evidenceAudioDigest,
    programSpaceDigest: source.programSpace.digest,
    rawEvidenceArtifactDigest: digestOf("whisperx-test:raw"),
    durationSec: 1,
    segments: [{
      sourceSegmentId: "line",
      startSec: 0,
      endSec: 1,
      words: [{ text: "hello", startSec: 0.1, endSec: 0.4 }],
      chars: [],
    }],
  });
  const normalized = normalizeWhisperXAlignment(measured);
  assert.equal(normalized.contract, "svml.aligned-transcript-evidence@1");
  assert.equal(normalized.basisDigest, source.basisDigest);
  assert.throws(
    () => normalizeWhisperXAlignment({
      ...measured,
      segments: [{ ...measured.segments[0]!, words: [{ text: "tampered", startSec: 0.1, endSec: 0.4 }] }],
    }),
    /alignment digest/u,
  );
});

test("WhisperX installs into the host-neutral compute port without a Node Driver", () => {
  const registrations: { readonly producer: ProducerRef; readonly digest: Digest }[] = [];
  const registrar: ProducerRegistrar = {
    registerProducer(producer, implementationDigest) {
      registrations.push({ producer, digest: implementationDigest });
    },
  };

  registerProducerFacets(registrar, whisperXComponent.producers);

  assert.deepEqual(registrations.map((item) => item.producer), [
    whisperXProducers.request,
    whisperXProducers.normalize,
  ]);
});
