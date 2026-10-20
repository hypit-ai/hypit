import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalWhisperXProvider,
  interpretWhisperXResponse,
} from "../src/index.js";

test("local WhisperX Provider pins the complete service runtime and is independently queued", () => {
  const provider = createLocalWhisperXProvider({ expectedModel: "small", defaultConcurrency: 2 });
  assert.equal(provider.instance.id, "whisperx.local");
  assert.throws(
    () => createLocalWhisperXProvider({ baseUrl: "https://whisper.example.com" }),
    /loopback/u,
  );
});

test("wire seconds are lowered once to exact evidence samples without authored Segment knowledge", () => {
  const evidence = interpretWhisperXResponse({
    language: "en",
    segments: [{
      start: 0.1,
      end: 1.8,
      words: [
        { text: "hello", start: 0.1, end: 0.4, score: 0.99 },
        { text: "crossing", start: 0.9, end: 1.1, score: 0.8 },
        { text: "world", start: 1.2, end: 1.6 },
      ],
    }],
  }, 32_000);
  assert.equal(evidence.length, 1);
  assert.deepEqual(
    { startSample: evidence[0]!.startSample, endSampleExclusive: evidence[0]!.endSampleExclusive },
    { startSample: 1_600, endSampleExclusive: 28_800 },
  );
  assert.deepEqual(evidence[0]!.words, [
    { text: "hello", startSample: 1_600, endSampleExclusive: 6_400, score: 0.99 },
    { text: "crossing", startSample: 14_400, endSampleExclusive: 17_600, score: 0.8 },
    { text: "world", startSample: 19_200, endSampleExclusive: 25_600 },
  ]);
});
