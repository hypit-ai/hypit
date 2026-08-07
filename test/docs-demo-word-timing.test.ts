import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_WORD_GAP_FILL,
  wordAtTime,
} from "../docs/.vitepress/theme/components/demo-word-timing";

const words = [
  { text: "previous", start: 0, end: 1 },
  { text: "next", start: 1.4, end: 2 },
];

test("keeps the previous docs demo word active until the next word starts", () => {
  assert.equal(wordAtTime(words, 1.2)?.text, "previous");
  assert.equal(wordAtTime(words, 1.399)?.text, "previous");
  assert.equal(wordAtTime(words, 1.4)?.text, "next");
});

test("does not extend the final word without a following word", () => {
  assert.equal(wordAtTime(words, 2.01), null);
});

test("caps gap filling during a real pause", () => {
  const wordsWithPause = [
    { text: "before", start: 0, end: 1 },
    { text: "after", start: 2, end: 2.5 },
  ];

  assert.equal(wordAtTime(wordsWithPause, 1 + MAX_WORD_GAP_FILL - .001)?.text, "before");
  assert.equal(wordAtTime(wordsWithPause, 1 + MAX_WORD_GAP_FILL), null);
  assert.equal(wordAtTime(wordsWithPause, 2)?.text, "after");
});
