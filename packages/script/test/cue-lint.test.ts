import assert from "node:assert/strict";
import test from "node:test";
import { parseScript, validateCaptionCueLengths } from "../src/index.js";

function parsed(body: string) { return parseScript("test.svml", body); }

test("Cue lint accepts four words and rejects an unbroken five-word Cue", () => {
  const good = validateCaptionCueLengths(parsed("<one>one two three four</one>"));
  assert.deepEqual(good, []);
  const bad = validateCaptionCueLengths(parsed("<one>one two three four five</one>"));
  assert.equal(bad.length, 1);
  assert.equal(bad[0]?.wordCount, 5);
  assert.equal(bad[0]?.segment, "one");
});

test("Cue lint counts visible Dual Text words and respects authored breaks", () => {
  assert.equal(validateCaptionCueLengths(parsed("<one>one two || three four</one>")).length, 0);
  const bad = validateCaptionCueLengths(parsed("<one>one two three four five || six</one>"));
  assert.equal(bad[0]?.wordCount, 5);
  const dual = validateCaptionCueLengths(parsed("<one><one two three four five | uno dos tres cuatro cinco></one>"));
  assert.equal(dual[0]?.wordCount, 5);
});
