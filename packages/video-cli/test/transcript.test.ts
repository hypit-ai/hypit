import assert from "node:assert/strict";
import test from "node:test";
import { phraseRanges, wordsAt } from "../src/transcript.js";

test("word annotations retain missing times and distinguish word boundaries, overlap and gaps", () => {
  const words = [
    { text: "hello", start: 0, end: 0.4 }, { text: "world", start: 0.4, end: 0.8 },
    { text: "yes", start: 0.6, end: 0.9 }, { text: "untimed" }, { text: "again", start: 1.2, end: 1.5 },
  ];
  assert.deepEqual(wordsAt(words, 0.4).active.map((word) => word.text), ["world"]);
  assert.deepEqual(wordsAt(words, 0.7).active.map((word) => word.text), ["world", "yes"]);
  assert.deepEqual(wordsAt(words, 1).active, []);
  assert.ok(wordsAt(words, 1).context.some((word) => word.text === "untimed" && word.start === undefined));
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
