import assert from "node:assert/strict";
import test from "node:test";
import { createResolvedClosure } from "@hypit/hypit/kernel";
import { decodeMarkup, MarkupSurfaceRegistry } from "@hypit/hypit/markup";
import {
  decodeSpeechTranscriptSurface,
  decodeSpeechTranscriptSource,
  phraseRanges,
  speechEvidenceManifest,
  speechEvidenceMarkupSurfaces,
  speechEvidenceModuleRef,
  speechTranscriptSource,
  transcriptWordsFromEvidence,
  wordsAt,
} from "../src/index.js";

test("editable transcript Source compiles back to the exact evidence Record", async () => {
  const evidence = {
    sampleFrames: 32_000,
    passages: [{
      startSample: 800,
      endSampleExclusive: 20_000,
      words: [{ text: "<你好 & café>", startSample: 1_600, endSampleExclusive: 6_400, score: 0.97 }],
      chars: [{ char: "你", wordIndex: 0, startSample: 1_600, endSampleExclusive: 2_400, score: 0.92 }],
      speechActivity: [{ startSample: 1_200, endSampleExclusive: 7_000 }],
    }],
  };
  const source = speechTranscriptSource("opening", evidence);
  assert.match(source, /<speech:Transcript id="opening">/u);
  assert.doesNotMatch(source, /<你好/u);
  assert.deepEqual(decodeSpeechTranscriptSource(source), evidence);
  const registry = new MarkupSurfaceRegistry();
  registry.registerRaw({
    module: speechEvidenceModuleRef,
    declaration: speechEvidenceMarkupSurfaces[0],
    handler: decodeSpeechTranscriptSurface,
  });
  const compiled = await decodeMarkup({
    name: "opening.transcript.svml",
    text: source.slice(source.indexOf("<svml>")),
  }, {
    closure: createResolvedClosure([speechEvidenceManifest]),
    registry,
    resolveModule: () => speechEvidenceModuleRef,
  });
  assert.deepEqual(compiled.records.find((record) => record.id === "opening")?.value, evidence);
  assert.deepEqual(transcriptWordsFromEvidence(evidence), [{ text: "<你好 & café>", start: 0.1, end: 0.4 }]);
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
