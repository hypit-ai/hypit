import assert from "node:assert/strict";
import test from "node:test";
import { adjustScriptMoment, adjustScriptSelection, captionDocument, narrativeValue, parseScript } from "@hypit/script";

const fixtures = [
  '<one><HOST>“Hello,” world{emphasis}! @beat!</one>',
  '<one><HOST>你好，世界！@beat!</one>',
  '<one><HOST>用<Hypit|Hai Pit>做视频 || 很好。@beat!</one>',
  '<one/>\r\n<two><HOST>Hello. @beat!</two>',
  '<one>  <HOST>first    @beat!   second.\n  <GUEST>Third.</one><two></two>',
];

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
