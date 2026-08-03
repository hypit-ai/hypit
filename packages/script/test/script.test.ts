import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@svml/core";
import {
  ScriptSyntaxError,
  formatScript,
  narrativeValue,
  parseScript,
} from "@svml/script";

test("named blocks are Segments and Role Cues do not depend on line breaks", () => {
  const compact = parseScript(
    "compact.svml",
    "<opening><ALICE>Hello there.<BOB>Good morning.</opening><pause/>",
  );
  const multiline = parseScript(
    "multiline.svml",
    `
      <opening>
        <ALICE>Hello there.
        <BOB>Good morning.
      </opening>

      <pause/>
    `,
  );

  assert.equal(digestOf(narrativeValue(compact)), digestOf(narrativeValue(multiline)));
  assert.deepEqual(compact.segments.map((segment) => segment.id), ["opening", "pause"]);
  assert.deepEqual(compact.turns.map((turn) => turn.role), ["ALICE", "BOB"]);
  assert.equal(compact.projections.dialogue, "ALICE: Hello there.\nBOB: Good morning.");
});

test("Script produces exactly 2M + 2N independent semantic anchors", () => {
  const parsed = parseScript("anchors.svml", "<one>One two.</one><silence/><two>Three.</two>");
  assert.equal(
    parsed.semanticIndex.anchors.length,
    2 * parsed.tokens.length + 2 * parsed.segments.length,
  );
  assert.equal(new Set(parsed.semanticIndex.anchors.map((anchor) => anchor.id)).size, parsed.semanticIndex.anchors.length);
  assert.deepEqual(
    parsed.segments.map((segment) => [segment.startAnchorId, segment.endAnchorId]),
    [
      ["segment:one:start", "segment:one:end"],
      ["segment:silence:start", "segment:silence:end"],
      ["segment:two:start", "segment:two:end"],
    ],
  );
});

test("selections, moments and Dual Text preserve separate semantic projections", () => {
  const parsed = parseScript(
    "rich.svml",
    `@whole
      <answer>
        <BOB>I @beat!really <laughed | laughed my ass off> there.</answer>
      @/whole~`,
  );

  assert.equal(parsed.projections.speech, "I really laughed my ass off there.");
  assert.equal(parsed.projections.caption, "I really laughed there.");
  assert.equal(parsed.projections.dialogue, "BOB: I really laughed my ass off there.");
  assert.deepEqual(parsed.selections.map((selection) => selection.id), ["whole"]);
  assert.deepEqual(parsed.moments.map((moment) => moment.id), ["beat"]);
  assert.equal(parsed.captionAtoms[0]?.display, "laughed");
});

test("mismatched named Segment closes are rejected", () => {
  assert.throws(
    () => parseScript("bad.svml", "<opening>Hello.</ending>"),
    (error: unknown) => error instanceof ScriptSyntaxError && error.code === "SCRIPT_SEGMENT_MISMATCH",
  );
  assert.throws(
    () => parseScript("attribute.svml", "<opening id=\"old\">Hello.</opening>"),
    (error: unknown) => error instanceof ScriptSyntaxError && error.code === "SCRIPT_SEGMENT_OPEN",
  );
});

test("zero-width temporal markers may touch a token edge but cannot split a token", () => {
  const parsed = parseScript("edge.svml", "<line>@beat!really good</line>");
  assert.deepEqual(parsed.tokens.map((token) => token.text), ["really", "good"]);
  assert.deepEqual(parsed.moments.map((moment) => moment.id), ["beat"]);

  assert.throws(
    () => parseScript("split.svml", "<line>re@beat!ally good</line>"),
    (error: unknown) =>
      error instanceof ScriptSyntaxError && error.code === "SCRIPT_MARKER_TOKEN_BOUNDARY",
  );
});

test("the formatter is semantic-preserving and idempotent", () => {
  const input = "<opening><ALICE>Hello there.<BOB>Good morning.</opening><pause/>";
  const once = formatScript("format.svml", input);
  const twice = formatScript("format.svml", once);
  assert.equal(twice, once);
  assert.equal(
    digestOf(narrativeValue(parseScript("before.svml", input))),
    digestOf(narrativeValue(parseScript("after.svml", once))),
  );
});
