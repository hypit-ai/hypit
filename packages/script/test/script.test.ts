import assert from "node:assert/strict";
import test from "node:test";

import {
  ScriptSyntaxError,
  adjustScriptMoment,
  adjustScriptSelection,
  captionDocument,
  narrativeCaptionBinding,
  narrativeValue,
  parseScript,
  serializeCaption,
  serializeDialogue,
  serializeSpeech,
} from "@hypit/script";

test("Selection source edits relocate markers by 2M + 2N Anchor identity", () => {
  const source = "<one><HOST>@{focus} alpha beta @{/focus} gamma</one>\r\n<two><HOST>delta epsilon</two>";
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

test("Script outer cuts are the first and last Segment boundaries", () => {
  const source = "@{focus} <one>alpha</one>\n<two>beta</two> @{/focus}";
  const parsed = parseScript("outer-cuts.svml", source);
  const selection = parsed.selections[0]!;
  assert.deepEqual([selection.startAnchorId, selection.endAnchorId], ["segment:one:start", "segment:two:end"]);
  assert.equal(parsed.anchors.length, 2 * parsed.tokens.length + 2 * parsed.segments.length);
  assert.equal(parsed.anchors.some((anchor) => anchor.id.startsWith("program:")), false);
});

test("Moment source edits relocate one marker to an exact semantic Anchor", () => {
  const source = "<one><HOST>alpha @{cue!} beta</one><two><HOST>gamma</two>";
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
  const document = captionDocument(parsed, "story.caption", "story");
  assert.equal(document.units.length, 3);
  assert.equal(document.units[1]!.wordIds.length, 1);
  assert.equal(narrativeCaptionBinding(parsed, "story.caption", "story").units[1]!.sourceTokenIds.length, 4);
  assert.equal(document.cues.length, 1);
  assert.deepEqual(document.cues[0]!.unitIds, document.units.map((unit) => unit.id));
  assert.equal((narrativeValue(parsed, "story") as { anchors: unknown[] }).anchors.length,
    2 * parsed.tokens.length + 2 * parsed.segments.length);
});

test("Dual Text binds several display Words through one Unit to several Narrative Tokens", () => {
  const parsed = parseScript("dual-n-m.svml", "<line><test1 test2 | test3 test4 test5></line>");
  const document = captionDocument(parsed, "story.caption", "story");
  const binding = narrativeCaptionBinding(parsed, document.id, "story");
  assert.deepEqual(document.words.map((word) => word.text), ["test1", "test2"]);
  assert.equal(document.units.length, 1);
  assert.deepEqual(document.units[0]!.wordIds, document.words.map((word) => word.id));
  assert.deepEqual(parsed.tokens.map((token) => token.text), ["test3", "test4", "test5"]);
  assert.deepEqual(binding.units[0]!.sourceTokenIds, parsed.tokens.map((token) => token.id));
  assert.deepEqual(document.cues[0]!.unitIds, [document.units[0]!.id]);
});

test("Role turns and Segments author Cue boundaries without leaking Narrative groups into Units", () => {
  const parsed = parseScript("cue-structure.svml", "<one><A>first <B>second</one><two>third</two>");
  const document = captionDocument(parsed, "story.caption", "story");
  assert.deepEqual(document.cues.map((cue) => cue.role), ["A", "B", undefined]);
  assert.equal(document.cues.length, 3);
  assert.deepEqual(document.cues.flatMap((cue) => cue.unitIds), document.units.map((unit) => unit.id));
  assert.equal(document.units.some((unit) => "groupId" in unit || "role" in unit), false);
});

test("Cues partition complete units at authored breaks", () => {
  const parsed = parseScript("break.svml", "<line>one two || three four</line>");
  const document = captionDocument(parsed, "story.caption", "story");
  assert.equal(document.cues.length, 2);
  assert.deepEqual(document.cues.map((cue) => cue.unitIds), [
    document.units.slice(0, 2).map((unit) => unit.id),
    document.units.slice(2).map((unit) => unit.id),
  ]);
});

test("Caption punctuation is display-only and CJK uses lexical character units", () => {
  const parsed = parseScript("punctuation-cjk.svml", "<line><test | now>. here 你好，世界！</line>");
  const document = captionDocument(parsed, "story.caption", "story");
  assert.deepEqual(parsed.tokens.map((token) => token.text), ["now", "here", "你", "好", "世", "界"]);
  assert.deepEqual(document.words.slice(0, 2).map((word) => word.text), ["test.", "here"]);
  assert.deepEqual(document.words.slice(-4).map((word) => word.text), ["你", "好，", "世", "界！"]);
});

test("Caption punctuation assigns ASCII quotes to the enclosed display words", () => {
  const parsed = parseScript(
    "punctuation-quotes.svml",
    "<line>He said <\"hello world\" | hello world>. 他说 <“你好” | 你好>。</line>",
  );
  const document = captionDocument(parsed, "story.caption", "story");
  assert.deepEqual(parsed.tokens.map((token) => token.text), [
    "He", "said", "hello", "world", "他", "说", "你", "好",
  ]);
  assert.deepEqual(document.words.map((word) => word.text), [
    "He", "said", "\"hello", "world\".", "他", "说", "“你", "好”。",
  ]);
});

test("Mixed-script brand names preserve following character units and authored Cue breaks", () => {
  const parsed = parseScript("mixed-script.svml", "<line>用Hypit生成视频，||我的AI助手做3个视频。</line>");
  const document = captionDocument(parsed, "story.caption", "story");
  assert.deepEqual(parsed.tokens.map((token) => token.text), [
    "用", "Hypit", "生", "成", "视", "频", "我", "的", "AI", "助", "手", "做", "3", "个", "视", "频",
  ]);
  assert.deepEqual(document.words.slice(0, 6).map((word) => word.text), [
    "用", "Hypit", "生", "成", "视", "频，",
  ]);
  assert.deepEqual(document.cues[0]?.unitIds, document.units.slice(0, 6).map((unit) => unit.id));
});

test("Script keeps ordinary compounds and formatted numbers lexical", () => {
  const parsed = parseScript(
    "punctuation-compounds.svml",
    "<line>rock ’n’ roll costs 1,234.56 dollars.</line>",
  );
  const document = captionDocument(parsed, "story.caption", "story");
  assert.deepEqual(parsed.tokens.map((token) => token.text), [
    "rock", "n", "roll", "costs", "1,234.56", "dollars",
  ]);
  assert.deepEqual(document.words.map((word) => word.text), [
    "rock", "’n’", "roll", "costs", "1,234.56", "dollars.",
  ]);
});

test("Comma-grouped numbers keep a hyphenated suffix in one lexical unit", () => {
  const parsed = parseScript(
    "comma-group-compound.svml",
    "<line>a 1,000-word essay beats a 123,456,789-point list and 1，000-word的理由.</line>",
  );
  assert.deepEqual(parsed.tokens.map((token) => token.text), [
    "a", "1,000-word", "essay", "beats", "a", "123,456,789-point", "list", "and", "1，000-word", "的", "理", "由",
  ]);
  const document = captionDocument(parsed, "story.caption", "story");
  assert.deepEqual(document.words.map((word) => word.text), [
    "a", "1,000-word", "essay", "beats", "a", "123,456,789-point", "list", "and", "1，000-word", "的", "理", "由.",
  ]);
});

test("A single pipe is literal and a double pipe is an authored Cue Break", () => {
  const parsed = parseScript("pipes.svml", "<line>one | two || three \\|\\| four</line>");
  const document = captionDocument(parsed, "story.caption", "story");
  assert.equal(document.cues.length, 2);
  assert.equal(serializeCaption(parsed), "one | two three || four");
  assert.deepEqual(document.words.map((word) => word.text), ["one |", "two", "three ||", "four"]);
});

test("Dual display text cannot contain semantic markers", () => {
  assert.throws(
    () => parseScript("dual-marker.svml", "<line><@{bad} | spoken></line>"),
    (error: unknown) => error instanceof ScriptSyntaxError && error.code === "SCRIPT_DUAL_DISPLAY_MARKER",
  );

  const parsed = parseScript("dual-spoken-selection.svml", "<line><shown | @{start} spoken words @{/start}></line>");
  assert.equal(parsed.selections.length, 1);
});

test("Script projects flat token attributes onto display words without changing timing units", () => {
  const parsed = parseScript(
    "word-attributes.svml",
    "<line>This is really{emphasis,keyword} <hypit{brand} | hype it> now.</line>",
  );
  const document = captionDocument(parsed, "story.caption", "story");
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
  assert.equal(narrativeCaptionBinding(parsed, "story.caption", "story").units[3]!.sourceTokenIds.length, 2);
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
