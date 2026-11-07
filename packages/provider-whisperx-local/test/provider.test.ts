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

test("wire responses become one provider-neutral timed transcript without recognizer scores", () => {
  const transcript = interpretWhisperXResponse({
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
  });
  assert.equal(transcript.segments.length, 1);
  assert.deepEqual(transcript.word_segments, [
    { word: "hello", start: 0.1, end: 0.4 },
    { word: "crossing", start: 0.9, end: 1.1 },
    { word: "world", start: 1.2, end: 1.6 },
  ]);
});
