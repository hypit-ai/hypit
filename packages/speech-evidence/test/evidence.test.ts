import { prepareMedia, preparedAudioSource } from "@hypit/media";
import {
  assertSpeechEvidenceAudioIdentity,
  assertSpeechTranscriptEvidence,
  sealSpeechEvidenceAudio,
  sealSpeechTranscriptEvidence,
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

test("SpeechTranscriptEvidence validates the complete provider-neutral observation", () => {
  const value = sealSpeechTranscriptEvidence({
    sampleFrames: 16_000,
    passages: [{
      startSample: 0,
      endSampleExclusive: 16_000,
      words: [{ text: "hello", startSample: 1_000, endSampleExclusive: 4_000, score: 0.9 }],
      chars: [{ char: "h", wordIndex: 0, startSample: 1_000, endSampleExclusive: 1_500, score: 0.8 }],
      speechActivity: [{ startSample: 800, endSampleExclusive: 4_200 }],
    }],
  });
  assert.doesNotThrow(() => assertSpeechTranscriptEvidence(value));
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, words: [{ text: "hello", startSample: 1_000 }] }],
  }), /word is invalid/u);
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, chars: [{ char: "h", wordIndex: 2 }] }],
  }), /character is invalid/u);
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, speechActivity: [{ startSample: 0, endSampleExclusive: 16_001 }] }],
  }), /speech activity is invalid/u);
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, startSample: 2_000, endSampleExclusive: 2_000 }],
  }), /passage is invalid/u);
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, words: [{ ...value.passages[0]!.words[0]!,
      startSample: 4_000, endSampleExclusive: 1_000 }] }],
  }), /word is invalid/u);
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, chars: [{ ...value.passages[0]!.chars[0]!,
      startSample: 1_500, endSampleExclusive: 1_500 }] }],
  }), /character is invalid/u);
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, speechActivity: [{ startSample: 4_200, endSampleExclusive: 800 }] }],
  }), /speech activity is invalid/u);
  assert.throws(() => sealSpeechTranscriptEvidence({ ...value, debug: true } as never), /unsupported field debug/u);
  assert.throws(() => sealSpeechTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, words: [{ ...value.passages[0]!.words[0]!, debug: true }] }],
  } as never), /word has unsupported field debug/u);
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
    inspection: { container: { formatNames: ["wav"] }, streams: [{
      kind: "audio", index: 0, codecType: "audio", codecName: "pcm_s16le",
      disposition: { default: true, attachedPicture: false }, timingStatus: "admissible",
      timeBase: { numerator: 1, denominator: 48_000 },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
      endPts: { ticks: "96000", timeBase: { numerator: 1, denominator: 48_000 } },
      decodedUnitCount: 96_000, sampleRate: 48_000, channels: 2, decodedSampleFrames: 96_000,
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
