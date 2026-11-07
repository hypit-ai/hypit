import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeSpeechTranscriptEvidence,
  encodeSpeechTranscriptEvidence,
  phraseRanges,
  speechEvidenceTypes,
  transcriptWordsFromEvidence,
  wordsAt,
} from "../src/index.js";
import { hypitPackage } from "../src/activation.js";
import { productExporterForType, productExportersFromFacets } from "@hypit/hypit/product";
import { createMediaRepresentationHostFromFacets } from "@hypit/media-asset";
import type { ResolvedMediaAsset } from "@hypit/media-asset";
import { identityTemporalMap, sealLocalTemporalDomain } from "@hypit/temporal";

function representedSpeechAsset(sampleFrames = 16_000): ResolvedMediaAsset {
  const mediaDomain = sealLocalTemporalDomain({
    id: "media",
    duration: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } },
  });
  const evidenceDomain = sealLocalTemporalDomain({
    id: "speech-evidence",
    duration: { ticks: String(sampleFrames), timeBase: { numerator: 1, denominator: 16_000 } },
  });
  const map = identityTemporalMap(mediaDomain);
  return {
    id: "interview",
    media: {
      id: "interview-media",
      source: { kind: "blob", resource: "res_media", size: 1, mediaType: "video/mp4" },
      domain: mediaDomain,
      audio: {
        streamIndex: 0,
        presentationStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
        sourceDomain: mediaDomain,
        map,
      },
    },
    representations: [{
      id: "speech.zh",
      type: speechEvidenceTypes.transcript,
      document: { kind: "blob", resource: "res_transcript", size: 1, mediaType: "application/json" },
      resources: {},
      binding: {
        temporal: { mapToMedia: { stages: [{ ...map.stages[0]!, target: evidenceDomain }] } },
        audio: { member: "audio" },
      },
    }],
  };
}

test("editable transcript JSON round-trips the exact evidence value", () => {
  const evidence = {
    sampleFrames: 32_000,
    passages: [{
      startSample: 800,
      endSampleExclusive: 20_000,
      words: [{ text: "<你好 & café>", startSample: 1_600, endSampleExclusive: 6_400 }],
      chars: [{ char: "你", wordIndex: 0, startSample: 1_600, endSampleExclusive: 2_400 }],
      speechActivity: [{ startSample: 1_200, endSampleExclusive: 7_000 }],
    }],
  };
  const document = encodeSpeechTranscriptEvidence(evidence);
  assert.deepEqual(decodeSpeechTranscriptEvidence(document), evidence);
  assert.deepEqual(transcriptWordsFromEvidence(evidence), [{ text: "<你好 & café>", start: 0.1, end: 0.4 }]);
});

test("the Speech Evidence package exports structured transcripts as JSON", async () => {
  const evidence = { sampleFrames: 16_000, passages: [{ words: [], chars: [] }] };
  const exporter = productExporterForType(
    productExportersFromFacets(hypitPackage.facets),
    speechEvidenceTypes.transcript,
  );
  assert.notEqual(exporter, undefined);
  const exported = await exporter!.export({
    name: "speech.transcript",
    type: speechEvidenceTypes.transcript,
    value: evidence,
    async openResource() { return undefined; },
  });
  assert(exported.bytes instanceof Uint8Array);
  assert.deepEqual(decodeSpeechTranscriptEvidence(new TextDecoder().decode(exported.bytes)), evidence);
});

test("the Speech Evidence package opens its exact file-backed Media Representation", async () => {
  const evidence = { sampleFrames: 16_000, passages: [{
    words: [{ text: "known", startSample: 1_000, endSampleExclusive: 8_000 }], chars: [],
  }] };
  const host = createMediaRepresentationHostFromFacets(hypitPackage.facets);
  const opened = await host.open(representedSpeechAsset(), "speech.zh", async () =>
    new TextEncoder().encode(encodeSpeechTranscriptEvidence(evidence)));
  assert.deepEqual(opened, evidence);

  await assert.rejects(() => host.open(representedSpeechAsset(8_000), "speech.zh", async () =>
    new TextEncoder().encode(encodeSpeechTranscriptEvidence(evidence))), /sample span differs/u);
});

test("word annotations retain missing times and distinguish word boundaries, overlap and gaps", () => {
  const words = [
    { text: "hello", start: 0, end: 0.4 }, { text: "world", start: 0.4, end: 0.8 },
    { text: "yes", start: 0.6, end: 0.9 }, { text: "untimed" }, { text: "again", start: 1.2, end: 1.5 },
  ];
  assert.deepEqual(wordsAt(words, 0.4).active.map((word) => word.text), ["world"]);
  assert.deepEqual(wordsAt(words, 0.7).active.map((word) => word.text), ["world", "yes"]);
  assert.deepEqual(wordsAt(words, 1).active, []);
  assert.ok(wordsAt(words, 1).context.some((word) => word.text === "untimed" && word.start === undefined));
  assert.deepEqual(wordsAt(words, 0.4, 0).context.map((word) => word.text), ["world"]);
  assert.throws(() => wordsAt(words, 0.4, -1), /word context must be a non-negative whole number/);
});

test("phrase location preserves repeated occurrences and multilingual word boundaries", () => {
  const words = [
    { text: "Hello,", start: 0.1, end: 0.3 }, { text: "world!", start: 0.3, end: 0.8 },
    { text: "hello", start: 2.1, end: 2.4 }, { text: "world", start: 2.4, end: 2.8 },
    { text: "你好", start: 3, end: 3.2 }, { text: "世界。", start: 3.2, end: 3.5 },
  ];
  assert.deepEqual(phraseRanges(words, "HELLO world"), [{ start: 0.1, end: 0.8 }, { start: 2.1, end: 2.8 }]);
  assert.deepEqual(phraseRanges(words, "你好世界"), [{ start: 3, end: 3.5 }]);
  assert.deepEqual(phraseRanges(words, "hell"), []);
  assert.throws(() => phraseRanges([{ text: "hello" }], "hello"), /missing boundary times/);
});
