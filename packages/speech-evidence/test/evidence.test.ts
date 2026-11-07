import { prepareMedia, preparedAudioSource } from "@hypit/media";
import {
  assertSpeechEvidenceAudioIdentity,
  sealSpeechEvidenceAudio,
  speechEvidenceSampleFrames,
  speechEvidenceProducers,
} from "@hypit/speech-evidence";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { speechEvidenceComponent } from "../src/component.js";

test("speech evidence resolves exact local duration directly to its 16 kHz sample domain", () => {
  assert.equal(speechEvidenceSampleFrames({ id: "one", duration: {
    ticks: "480001", timeBase: { numerator: 1, denominator: 48000 },
  } }), 160_000);
  assert.equal(speechEvidenceSampleFrames({ id: "two", duration: {
    ticks: "480002", timeBase: { numerator: 1, denominator: 48000 },
  } }), 160_001);
});

test("SpeechEvidenceAudio carries only canonical bytes and their exact sample span", () => {
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
  assert.throws(() => assertSpeechEvidenceAudioIdentity({ ...value, sampleFrames: 0 }), /identity/u);
  assert.throws(() => sealSpeechEvidenceAudio({ ...value, debug: true } as never), /unsupported field debug/u);
});

test("Speech Evidence projects only the selected audio source and its complete preparation relation", async () => {
  const project = speechEvidenceComponent.producers.find(
    (item) => item.producer.name === speechEvidenceProducers.projectAudio.name,
  )!;
  const source = {
    kind: "blob" as const, resource: fixtureResource("speech-evidence:source"), size: 384_044, mediaType: "audio/wav",
  };
  const media = prepareMedia({
    id: "speech",
    source,
    inspection: { streams: [{
      kind: "audio", index: 0, codecName: "pcm_s16le",
      disposition: { default: true, attachedPicture: false },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
      endPts: { ticks: "96000", timeBase: { numerator: 1, denominator: 48_000 } },
      sampleRate: 48_000, channels: 2, decodedSampleFrames: 96_000,
    }] },
    selection: { audioStreamIndex: 0, spanAuthority: "audio" },
  });
  const result = await project.handler({ inputs: {
    media: { value: (media) },
  } } as never);
  assert.equal(result.kind, "need");
  assert.deepEqual(result.constraints, {
    source: preparedAudioSource(media),
    preparation: media.audio!.map,
  });
});
