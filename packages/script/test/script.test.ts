import assert from "node:assert/strict";
import test from "node:test";

import {
  ScriptSyntaxError,
  adjustScriptMoment,
  adjustScriptSelection,
  captionDocument,
  narrativeValue,
  parseScript,
  serializeCaption,
  serializeDialogue,
  serializeSpeech,
} from "@hypit/script";

test("Selection source edits relocate markers by 2M + 2N Anchor identity", () => {
  const source = "<one><HOST>@focus alpha beta @/focus gamma</one>\r\n<two><HOST>delta epsilon</two>";
  const parsed = parseScript("selection-adjust.svml", source);
  const movedWords = adjustScriptSelection({
    sourceName: "selection-adjust.svml",
    source,
    parsed,
    adjustment: {
      id: "focus",
      startAnchorId: "segment:one:token:2:start",
      endAnchorId: "segment:one:token:3:end",
    },
  });
  const wordSelection = parseScript("selection-adjust.svml", movedWords).selections[0]!;
  assert.deepEqual([wordSelection.startAnchorId, wordSelection.endAnchorId], [
    "segment:one:token:2:start", "segment:one:token:3:end",
  ]);

  const movedSegment = adjustScriptSelection({
    sourceName: "selection-adjust.svml",
    source: movedWords,
    parsed: parseScript("selection-adjust.svml", movedWords),
    adjustment: {
      id: "focus",
      startAnchorId: "segment:two:start",
      endAnchorId: "segment:two:end",
    },
  });
  const reparsed = parseScript("selection-adjust.svml", movedSegment);
  assert.deepEqual(reparsed.tokens.map((token) => token.text), ["alpha", "beta", "gamma", "delta", "epsilon"]);
  assert.deepEqual([reparsed.selections[0]!.startAnchorId, reparsed.selections[0]!.endAnchorId], [
    "segment:two:start", "segment:two:end",
  ]);
});

test("Moment source edits relocate one marker to an exact semantic Anchor", () => {
  const source = "<one><HOST>alpha @cue! beta</one><two><HOST>gamma</two>";
  const moved = adjustScriptMoment({
    sourceName: "moment-adjust.svml",
    source,
    parsed: parseScript("moment-adjust.svml", source),
    adjustment: { id: "cue", anchorId: "segment:two:end" },
  });
  const parsed = parseScript("moment-adjust.svml", moved);
  assert.equal(parsed.moments[0]!.anchorId, "segment:two:end");
  assert.deepEqual(parsed.tokens.map((token) => token.text), ["alpha", "beta", "gamma"]);
});

test("Script keeps speech, dialogue and CaptionDocument as separate projections", () => {
  const parsed = parseScript("rich.svml", "<answer><BOB>I <laughed | laughed my ass off> there.</answer>");
  assert.equal(serializeSpeech(parsed), "I laughed my ass off there.");
  assert.equal(serializeDialogue(parsed), "BOB: I laughed my ass off there.");
  assert.equal(serializeCaption(parsed), "I laughed there.");
  const document = captionDocument(parsed, "story.caption");
  assert.equal(document.units.length, 3);
  assert.equal(document.units[1]!.wordIds.length, 1);
  assert.equal(document.units[1]!.sourceTokenIds.length, 4);
  assert.deepEqual(document.cueBreaks, []);
  assert.equal((narrativeValue(parsed) as { semanticIndex: { anchors: unknown[] } }).semanticIndex.anchors.length,
    2 * parsed.tokens.length + 2 * parsed.segments.length);
});

test("Cue breaks are authored between complete units", () => {
  const parsed = parseScript("break.svml", "<line>one two || three four</line>");
  const document = captionDocument(parsed, "story.caption");
  assert.equal(document.cueBreaks.length, 1);
  assert.equal(document.cueBreaks[0]!.afterUnitId, document.units[1]!.id);
});

test("Caption punctuation is display-only and CJK uses lexical character units", () => {
  const parsed = parseScript("punctuation-cjk.svml", "<line><test | now>. here 你好，世界！</line>");
  const document = captionDocument(parsed, "story.caption");
  assert.deepEqual(parsed.tokens.map((token) => token.text), ["now", "here", "你", "好", "世", "界"]);
  assert.deepEqual(document.words.slice(0, 2).map((word) => word.text), ["test.", "here"]);
  assert.deepEqual(document.words.slice(-4).map((word) => word.text), ["你", "好，", "世", "界！"]);
});

test("Caption punctuation assigns ASCII quotes to the enclosed display words", () => {
  const parsed = parseScript(
    "punctuation-quotes.svml",
    "<line>He said <\"hello world\" | hello world>. 他说 <“你好” | 你好>。</line>",
  );
  const document = captionDocument(parsed, "story.caption");
  assert.deepEqual(parsed.tokens.map((token) => token.text), [
    "He", "said", "hello", "world", "他", "说", "你", "好",
  ]);
  assert.deepEqual(document.words.map((word) => word.text), [
    "He", "said", "\"hello", "world\".", "他", "说", "“你", "好”。",
  ]);
});

test("Script keeps ordinary compounds and formatted numbers lexical", () => {
  const parsed = parseScript(
    "punctuation-compounds.svml",
    "<line>rock ’n’ roll costs 1,234.56 dollars.</line>",
  );
  const document = captionDocument(parsed, "story.caption");
  assert.deepEqual(parsed.tokens.map((token) => token.text), [
    "rock", "n", "roll", "costs", "1,234.56", "dollars",
  ]);
  assert.deepEqual(document.words.map((word) => word.text), [
    "rock", "’n’", "roll", "costs", "1,234.56", "dollars.",
  ]);
});

test("A single pipe is literal and a double pipe is an authored Cue Break", () => {
  const parsed = parseScript("pipes.svml", "<line>one | two || three \\|\\| four</line>");
  const document = captionDocument(parsed, "story.caption");
  assert.equal(document.cueBreaks.length, 1);
  assert.equal(serializeCaption(parsed), "one | two three || four");
  assert.deepEqual(document.words.map((word) => word.text), ["one|", "two", "three||", "four"]);
});

test("Dual display text cannot contain semantic markers", () => {
  assert.throws(
    () => parseScript("dual-marker.svml", "<line><@bad | spoken></line>"),
    (error: unknown) => error instanceof ScriptSyntaxError && error.code === "SCRIPT_DUAL_DISPLAY_MARKER",
  );

  const parsed = parseScript("dual-spoken-selection.svml", "<line><shown | @start spoken words @/start></line>");
  assert.equal(parsed.selections.length, 1);
});

test("Script projects flat token attributes onto display words without changing timing units", () => {
  const parsed = parseScript(
    "word-attributes.svml",
    "<line>This is really{emphasis,keyword} <hypit{brand} | hype it> now.</line>",
  );
  const document = captionDocument(parsed, "story.caption");
  assert.deepEqual(document.words.map((word) => [word.text, word.attributes]), [
    ["This", []],
    ["is", []],
    ["really", [
      { name: "emphasis", value: true },
      { name: "keyword", value: true },
    ]],
    ["hypit", [{ name: "brand", value: true }]],
    ["now.", []],
  ]);
  assert.equal(document.units[3]!.sourceTokenIds.length, 2);
});

test("Token attributes are flat and must follow a complete display token", () => {
  assert.throws(
    () => parseScript("attribute-nested.svml", "<line>really{emphasis{bad}}</line>"),
    (error: unknown) => error instanceof ScriptSyntaxError && error.code === "SCRIPT_ATTRIBUTE_NESTED",
  );
  assert.throws(
    () => parseScript("attribute-space.svml", "<line>really {emphasis}</line>"),
    (error: unknown) => error instanceof ScriptSyntaxError && error.code === "SCRIPT_ATTRIBUTE_TARGET",
  );
});
