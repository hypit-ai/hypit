import assert from "node:assert/strict";
import test from "node:test";
import { createMediaRepresentationHostFromFacets } from "@hypit/media-asset";
import { productExporterForType, productExportersFromFacets } from "@hypit/hypit/product";

import {
  decodeTimedTranscript,
  encodeTimedTranscript,
  phraseRanges,
  timedTranscript,
  transcriptWords,
  timedTranscriptTypes,
  wordsAt,
} from "../src/index.js";
import { hypitPackage } from "../src/activation.js";

test("TimedTranscript is one editable WhisperX-shaped JSON document", () => {
  const value = timedTranscript("zh", [{
    start: 0.1,
    end: 1.4,
    text: "你好 世界",
    words: [{ word: "你好", start: 0.1, end: 0.5 }, { word: "世界", start: 0.8, end: 1.4 }],
  }]);
  assert.deepEqual(decodeTimedTranscript(encodeTimedTranscript(value)), value);
  assert.deepEqual(transcriptWords(value), [
    { text: "你好", start: 0.1, end: 0.5 },
    { text: "世界", start: 0.8, end: 1.4 },
  ]);
});

test("TimedTranscript rejects recognizer metadata and inconsistent flattened words", () => {
  const value = timedTranscript("en", [{ start: 0, end: 1, text: "hello", words: [{ word: "hello", start: 0, end: 1 }] }]);
  assert.throws(() => decodeTimedTranscript(JSON.stringify({ ...value, provider: "whisperx" })), /unsupported field provider/u);
  assert.throws(() => decodeTimedTranscript(JSON.stringify({ ...value, word_segments: [] })), /must equal/u);
  assert.throws(() => decodeTimedTranscript(JSON.stringify({
    ...value,
    segments: [{ ...value.segments[0], words: [{ word: "hello", start: 0.5 }] }],
  })), /partial time range/u);
});

test("author views operate directly on transcript seconds", () => {
  const words = [
    { text: "Hello,", start: 0.1, end: 0.3 }, { text: "world!", start: 0.3, end: 0.8 },
    { text: "hello", start: 2.1, end: 2.4 }, { text: "world", start: 2.4, end: 2.8 },
  ];
  assert.deepEqual(wordsAt(words, 0.3, 0).active.map((word) => word.text), ["world!"]);
  assert.deepEqual(phraseRanges(words, "HELLO world"), [{ start: 0.1, end: 0.8 }, { start: 2.1, end: 2.8 }]);
});

test("the package exports and opens the one file-backed transcript Representation", async () => {
  const value = timedTranscript("en", [{ start: 0, end: 1, text: "hello",
    words: [{ word: "hello", start: 0.1, end: 0.8 }] }]);
  const exporter = productExporterForType(productExportersFromFacets(hypitPackage.facets), timedTranscriptTypes.transcript);
  assert.notEqual(exporter, undefined);
  const exported = await exporter!.export({
    name: "speech.transcript",
    type: timedTranscriptTypes.transcript,
    value,
    async openResource() { return undefined; },
  });
  assert(exported.bytes instanceof Uint8Array);
  const bytes = exported.bytes;
  assert.deepEqual(decodeTimedTranscript(new TextDecoder().decode(bytes)), value);

  const host = createMediaRepresentationHostFromFacets(hypitPackage.facets);
  const opened = await host.open({
    id: "interview",
    media: {} as never,
    representations: [{
      id: "speech.en",
      type: timedTranscriptTypes.transcript,
      document: { kind: "blob", resource: "res_transcript", size: bytes.byteLength, mediaType: "application/json" },
      resources: {},
      binding: {
        temporal: { mapToMedia: { stages: [{} as never] } },
        audio: { member: "audio" },
      },
    }],
  }, "speech.en", async () => bytes);
  assert.deepEqual(opened, value);
});
