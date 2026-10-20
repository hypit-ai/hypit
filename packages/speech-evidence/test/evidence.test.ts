import { timelineSampleFrames, sealTimeline } from "@hypit/timeline";
import { sealSynchronizedMedia } from "@hypit/media";
import {
  assertAlignedTranscriptEvidenceIdentity,
  assertSpeechEvidenceAudioIdentity,
  sealAlignedTranscriptEvidence,
  sealSpeechEvidenceAudio,
  speechEvidenceSampleBoundary,
  speechEvidenceProducers,
} from "@hypit/speech-evidence";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { speechEvidenceComponent } from "../src/component.js";

test("speech evidence uses integer rational boundary projection rather than floating duration arithmetic", () => {
  assert.equal(speechEvidenceSampleBoundary(0), 0);
  assert.equal(speechEvidenceSampleBoundary(480_000), 160_000);
  assert.equal(speechEvidenceSampleBoundary(480_001), 160_000);
  assert.equal(speechEvidenceSampleBoundary(480_002), 160_001);
  const ntsc = sealTimeline({ id: "test-space", frameCount: 30, frameRate: { numerator: 30_000, denominator: 1_001 } });
  assert.equal(timelineSampleFrames(ntsc, 48_000), 48_048);
});

test("SpeechEvidenceAudio identifies its source domain and exact sample span", () => {
  const value = sealSpeechEvidenceAudio({
    domainId: "speech-domain",
    artifact: {
      kind: "blob",
      resource: fixtureResource("evidence"),
      size: 32_044,
      mediaType: "audio/wav",
    },
    sampleFrames: 16_000,
  });
  assert.doesNotThrow(() => assertSpeechEvidenceAudioIdentity(value));
  assert.throws(() => assertSpeechEvidenceAudioIdentity({ ...value, domainId: "" }), /identity/u);
  assert.throws(() => assertSpeechEvidenceAudioIdentity({ ...value, sampleFrames: 0 }), /identity/u);
});

test("AlignedTranscriptEvidence validates the complete provider-neutral observation", () => {
  const value = sealAlignedTranscriptEvidence({
    domainId: "speech-domain",
    sampleFrames: 16_000,
    passages: [{
      startSample: 0,
      endSampleExclusive: 16_000,
      words: [{ text: "hello", startSample: 1_000, endSampleExclusive: 4_000, score: 0.9 }],
      chars: [{ char: "h", wordIndex: 0, startSample: 1_000, endSampleExclusive: 1_500, score: 0.8 }],
      speechActivity: [{ startSample: 800, endSampleExclusive: 4_200 }],
    }],
  });
  assert.doesNotThrow(() => assertAlignedTranscriptEvidenceIdentity(value));
  assert.throws(() => sealAlignedTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, words: [{ text: "hello", startSample: 1_000 }] }],
  }), /word is invalid/u);
  assert.throws(() => sealAlignedTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, chars: [{ char: "h", wordIndex: 2 }] }],
  }), /character is invalid/u);
  assert.throws(() => sealAlignedTranscriptEvidence({
    ...value,
    passages: [{ ...value.passages[0]!, speechActivity: [{ startSample: 0, endSampleExclusive: 16_001 }] }],
  }), /speech activity is invalid/u);
});

test("Speech Evidence owns projection from one matching normalized media domain", async () => {
  const project = speechEvidenceComponent.producers.find(
    (item) => item.producer.name === speechEvidenceProducers.projectAudio.name,
  )!;
  const media = sealSynchronizedMedia({
    frameDomain: { frameRate: { numerator: 30, denominator: 1 }, frameCount: 60 },
    audio: { artifact: {
      kind: "blob", resource: fixtureResource("speech-evidence:source"), size: 384_044, mediaType: "audio/wav",
    } },
  });
  const run = (frameCount: number) => project.handler({ inputs: {
    media: { value: (media) },
    domain: { value: ({
      id: "speech-domain", frameRate: media.frameDomain.frameRate, frameCount,
    }) },
  } } as never);

  const result = await run(60);
  assert.equal(result.kind, "need");
  assert.deepEqual(result.constraints, {
    domainId: "speech-domain",
    source: media.audio!.artifact,
    sourceSampleFrames: 96_000,
    evidenceSampleFrames: 32_000,
  });
  await assert.rejects(async () => run(59), /does not describe its normalized media/u);
});
