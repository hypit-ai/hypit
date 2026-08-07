import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { digestOf } from "@narratage/core";
import {
  ScriptSyntaxError,
  formatScript,
  narrativeValue,
  parseScript,
  serializeCaption,
  serializeDialogue,
  serializeSpeech,
} from "@narratage/script";

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
  assert.equal(serializeDialogue(compact), "ALICE: Hello there.\nBOB: Good morning.");
});

test("Role is optional per Turn and never leaks across Segment boundaries", () => {
  const parsed = parseScript(
    "optional-role.svml",
    "<intro>Roleless narration.</intro><answer><ALICE>Named reply.</answer><close>Roleless close.</close>",
  );
  assert.deepEqual(parsed.turns.map((turn) => turn.role), [undefined, "ALICE", undefined]);
  assert.equal(
    serializeDialogue(parsed),
    "Roleless narration.\nALICE: Named reply.\nRoleless close.",
  );
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

  assert.equal(serializeSpeech(parsed), "I really laughed my ass off there.");
  assert.equal(serializeCaption(parsed), "I really laughed there.");
  assert.equal(serializeDialogue(parsed), "BOB: I really laughed my ass off there.");
  assert.deepEqual(parsed.selections.map((selection) => selection.id), ["whole"]);
  assert.deepEqual(parsed.moments.map((moment) => moment.id), ["beat"]);
  assert.equal(parsed.captionProjection.regions.find((region) => region.kind === "alias")?.display, "laughed");
});

test("Caption Projection owns speech ranges without inventing alias word timing", () => {
  const parsed = parseScript(
    "caption.svml",
    `<line>
      <test this | test this>
      <15% off | fifteen percent off>
      <that was insane | what the fuck>
      <what the— | what the fuck>
      < | um>
    </line>`,
  );
  const [identity, discount, replacement, interrupted, hidden] = parsed.captionProjection.regions;

  assert.equal(parsed.captionProjection.contract, "svml.caption-projection@1");
  assert.equal(identity?.kind, "identity");
  assert.deepEqual(identity?.refinements.map((item) => item.display), ["test", "this"]);
  assert.equal(discount?.kind, "alias");
  assert.deepEqual(discount?.refinements.map((item) => item.display), ["off"]);
  assert.deepEqual(replacement?.refinements, []);
  assert.deepEqual(interrupted?.refinements.map((item) => item.display), ["what", "the"]);
  assert.equal(hidden?.kind, "hidden");
  assert.equal(hidden?.display, "");
  assert.equal(hidden?.endTokenExclusive! - hidden?.startToken!, 1);
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

test("the v2 authoring golden fixture reuses the implemented Script Surface unchanged", () => {
  const source = readFileSync("examples/talking-film-golden/main.svml", "utf8");
  const body = source.match(/<script>([\s\S]*?)<\/script>/u)?.[1];
  if (body === undefined) throw new Error("The authoring golden fixture has no Script body.");
  const parsed = parseScript("examples/talking-film-golden/main.svml", body);

  assert.deepEqual(parsed.segments.map((segment) => segment.id), ["opening", "answer"]);
  assert.deepEqual(parsed.selections.map((selection) => selection.id), [
    "alice-shot",
    "bob-shot",
    "product-demo",
  ]);
  assert.equal(
    serializeDialogue(parsed),
    "ALICE: What if a video could be edited by meaning instead of a timeline?\n"
      + "BOB: Then the script becomes the source. semantic video markup language lets every visual know why it is there.",
  );
  assert.match(serializeSpeech(parsed), /semantic video markup language/u);
  assert.match(serializeCaption(parsed), /SVML/u);
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
