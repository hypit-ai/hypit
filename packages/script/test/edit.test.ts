import assert from "node:assert/strict";
import test from "node:test";
import { adjustScriptMoment, adjustScriptSelection, captionDocument, narrativeValue, parseScript } from "@hypit/script";
import { cleanHorizontalProse } from "../src/lexical.js";

const fixtures = [
  '<one><HOST>“Hello,” world{emphasis}! @beat!</one>',
  '<one><HOST>你好，世界！@beat!</one>',
  '<one><HOST>用<Hypit|Hai Pit>做视频 || 很好。@beat!</one>',
  '<one/>\r\n<two><HOST>Hello. @beat!</two>',
  '<one>  <HOST>first    @beat!   second.\n  <GUEST>Third.</one><two></two>',
  '<one>A\n\t  ~@beat!  B  .</one>',
  '\t <one>\r\n\t  <HOST>We are\r\n\t  @beat!  talking about Instagram  .\r\n\t  </one>\r\n',
  '<one>\n  @beat!  \n  <HOST>你 好 ，世 界 ！\n</one>',
  '<one><!-- keep   this\n\t comment --> <HOST>用<Hypit|Hai  Pit>  做 视频{emphasis}  。@beat!</one>',
  '<one>Find \\@hypit now. @beat!</one>',
  '<one>Use \\{braces\\} here. @beat!</one>',
  '<one><Hypit|Hai \\@ Pit> works. @beat!</one>',
];

test("horizontal formatting preserves lexical distinctions and line breaks", () => {
  assert.equal(cleanHorizontalProse("3   .14"), "3 .14");
  assert.equal(cleanHorizontalProse("Instagram   .\n你 好 ，"), "Instagram.\n你好，");
});

for (const source of fixtures) test(`Moment round trips through structural and lexical anchors: ${source}`, () => {
  const original = parseScript("edit", source);
  const move = (text: string, anchorId: string) => adjustScriptMoment({
    sourceName: "edit", source: text, parsed: parseScript("edit", text), adjustment: { id: "beat", anchorId },
  });
  for (const anchor of original.semanticIndex.anchors) {
    const first = move(source, anchor.id);
    const back = move(first, original.moments[0]!.anchorId);
    assert.deepEqual(narrativeValue(parseScript("edit", back), "story"), narrativeValue(original, "story"));
    assert.deepEqual(captionDocument(parseScript("edit", back), "caption", "story"), captionDocument(original, "caption", "story"));
    // A second visit uses exactly the same spelling; spacing cannot accumulate.
    assert.equal(move(back, anchor.id), first);
  }
});

test("normalization retains line indentation and removes marker residue without remembering its origin", () => {
  const source = '<one>\r\n\t  <HOST>We are\r\n\t  @beat!  on   Instagram   .  \r\n\t  </one>';
  const original = parseScript("edit", source);
  const originalAnchor = original.moments[0]!.anchorId;
  const end = original.tokens.at(-1)!.endAnchorId;
  const move = (text: string, anchorId: string) => adjustScriptMoment({
    sourceName: "edit", source: text, parsed: parseScript("edit", text), adjustment: { id: "beat", anchorId },
  });
  const atEnd = move(source, end);
  assert.equal(atEnd, '<one>\r\n\t  <HOST>We are\r\n\t  on Instagram.~@beat!\r\n\t  </one>');
  let current = atEnd;
  for (let index = 0; index < 30; index++) {
    current = move(move(current, originalAnchor), end);
    assert.equal(current, atEnd);
  }
  assert.equal(move(atEnd, end), atEnd);
});

test("equivalent inline whitespace converges to the same marker spelling", () => {
  const sources = [
    '<one><HOST>@social on   Instagram @/social .</one>',
    '<one><HOST>@social on Instagram.@/social</one>',
  ];
  const normalized = sources.map(source => {
    const parsed = parseScript("edit", source);
    const selection = parsed.selections[0]!;
    return adjustScriptSelection({ sourceName: "edit", source, parsed, adjustment: selection });
  });
  assert.equal(normalized[0], normalized[1]);
  assert.match(normalized[0]!, /on Instagram\.@\/social/u);
});

test("Selection endpoints sharing a source position are written together in semantic order", () => {
  const source = '<one><HOST>@range hello @/range world.</one><empty/>';
  const original = parseScript("edit", source);
  const anchors = original.semanticIndex.anchors;
  for (let start = 0; start < anchors.length; start++) for (let end = start; end < anchors.length; end++) {
    const adjustment = { id: "range", startAnchorId: anchors[start]!.id, endAnchorId: anchors[end]!.id };
    const next = adjustScriptSelection({ sourceName: "edit", source, parsed: original, adjustment });
    const parsed = parseScript("edit", next);
    assert.equal(parsed.selections[0]!.startAnchorId, adjustment.startAnchorId);
    assert.equal(parsed.selections[0]!.endAnchorId, adjustment.endAnchorId);
  }
});

for (const source of [
  '<one>A   @s B  . @/s</one>',
  '<one>A   ~@s B  . @/s</one>',
  '<one>@s A   @/s B  .</one>',
  '<one>@s A   @/s~ B  .</one>',
]) test(`Selection affinity survives every structural round trip: ${source}`, () => {
  const original = parseScript("edit", source);
  const selection = original.selections[0]!;
  const move = (text: string, startAnchorId: string, endAnchorId: string) => adjustScriptSelection({
    sourceName: "edit", source: text, parsed: parseScript("edit", text),
    adjustment: { id: selection.id, startAnchorId, endAnchorId },
  });
  const expected = move(source, selection.startAnchorId, selection.endAnchorId);
  const anchors = original.semanticIndex.anchors;
  for (let start = 0; start < anchors.length; start++) for (let end = start; end < anchors.length; end++) {
    const moved = move(expected, anchors[start]!.id, anchors[end]!.id);
    const actual = parseScript("edit", moved).selections[0]!;
    assert.equal(actual.startAnchorId, anchors[start]!.id);
    assert.equal(actual.endAnchorId, anchors[end]!.id);
    assert.equal(move(moved, selection.startAnchorId, selection.endAnchorId), expected);
  }
});

test("Moving one relationship preserves crossing selections, cues and other moments", () => {
  const source = '<one><HOST>@a One @b two @/a || three @/b. @beat! ~@other!</one>';
  const parsed = parseScript("edit", source);
  const next = adjustScriptMoment({ sourceName: "edit", source, parsed,
    adjustment: { id: "beat", anchorId: parsed.tokens[0]!.endAnchorId } });
  const result = parseScript("edit", next);
  assert.deepEqual(result.selections.map(({ id, startAnchorId, endAnchorId }) => ({ id, startAnchorId, endAnchorId })),
    parsed.selections.map(({ id, startAnchorId, endAnchorId }) => ({ id, startAnchorId, endAnchorId })));
  assert.equal(result.moments.find((item) => item.id === "other")!.anchorId,
    parsed.moments.find((item) => item.id === "other")!.anchorId);
});
