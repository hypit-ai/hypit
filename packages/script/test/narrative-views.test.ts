import assert from "node:assert/strict";
import test from "node:test";
import { captionDocument, narrativeCaptionBinding, decodeScriptSurface, formatScript, narrativeDialogueTextValue,
  narrativeSpeechTextValue, narrativeValue, parseScript } from "@hypit/script";
import { assertNarrativeIdentity, narrativeAnchorTokenBoundary, narrativeSelectionTokenRange,
  narrativeTokensForSelection, narrativeTypes } from "@hypit/narrative";
import type { Narrative, NarrativeSelectionRef } from "@hypit/narrative";
import { captionTypes, decodeHiddenCaptionStyleSurface, sealCaptionStyle } from "@hypit/caption";
import type { CaptionDocument, CaptionProgram } from "@hypit/caption";
import { captionUnitsForNarrativeSelection } from "@hypit/narrative-caption";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { countSpeechEstimateUnits } from "@hypit/speech-estimate";
import type { Text } from "@hypit/text";

const body = `<intro><HOST>Try @{brand} <hypit|Hai-Pit> @{/brand} today. ||</intro>
<gap/>
<closing><HOST>现在 @{name} <声工坊|voice workshop> @{/name} 好用。<|indeed></closing>`;

function authored() {
  return narrativeValue(parseScript("views.svml", body), "story") as unknown as Narrative;
}

test("formatting takes Role Cue boundaries from parsed source, including Unicode roles", () => {
  const cases = [
    [String.raw`<one>Show \<HOST> literally.</one>`, String.raw`  Show \<HOST> literally.`],
    ['<one>hello<!-- <HOST> -->world.</one>', '  hello<!-- <HOST> -->world.'],
    ['<one><host>Then speak. <진행자>안녕하세요.</one>', '  <host>Then speak.\n  <진행자>안녕하세요.'],
  ] as const;
  for (const [source, content] of cases) {
    const formatted = formatScript("format", source);
    assert.equal(formatted, `<one>\n${content}\n</one>\n`);
    assert.deepEqual(narrativeValue(parseScript("format", formatted), "story"),
      narrativeValue(parseScript("format", source), "story"));
  }
});

test("omitted speech shares display prose while retaining ordinary Narrative and caption exports", () => {
  for (const [short, expanded] of [
    ['把<动效|><组件化|>。|| <直接复用|>。', '把<动效|动效><组件化|组件化>。|| <直接复用|直接复用>。'],
    ['<Git Hub|> 和 <API|A P I>。<|只说不显示>', '<Git Hub|Git Hub> 和 <API|A P I>。<|只说不显示>'],
    ['<图{emphasis}像|> 与 <\\@Hypit|>。', '<图{emphasis}像|图像> 与 <\\@Hypit|\\@Hypit>。'],
  ]) {
    const body = `<intro><HOST>${short}</intro>`;
    const parsed = parseScript("short.svml", body);
    const full = parseScript("full.svml", `<intro><HOST>${expanded}</intro>`);
    assert.deepEqual(narrativeValue(parsed, "story"), narrativeValue(full, "story"));
    assert.deepEqual(narrativeSpeechTextValue(parsed.segments[0]!), narrativeSpeechTextValue(full.segments[0]!));
    assert.deepEqual(narrativeDialogueTextValue(parsed.segments[0]!), narrativeDialogueTextValue(full.segments[0]!));
    const speech = narrativeSpeechTextValue(parsed.segments[0]!) as unknown as Text;
    assert.equal(countSpeechEstimateUnits(speech.value, "zh"), countSpeechEstimateUnits(full.serializations.speech, "zh"));
    assert.deepEqual(narrativeValue(parseScript("formatted", formatScript("short", body)), "story"), narrativeValue(parsed, "story"));
    const source = `<script id="story">${body}</script>`;
    const decoded = decodeScriptSurface({ sourceName: "short.svml", source, tag: "script",
      attributes: { id: "story" }, openingStart: 0, contentStart: source.indexOf(">") + 1 });
    assert.deepEqual(decoded.records.find(record => record.id === "story")?.value,
      { kind: "inline", value: narrativeValue(parsed, "story") });
  }
});

test("shared text permits semantic markers without changing display; empty groups still fail", () => {
  const parsed = parseScript("shared", '<intro><HOST><组@{part}件@{/part}化|></intro>');
  assert.equal(parsed.serializations.speech, "组件化");
  assert.equal(parsed.captionProjection.text, "组件化");
  assert.equal(parsed.selections[0]!.startAnchorId, parsed.tokens[1]!.startAnchorId);
  assert.equal(narrativeCaptionBinding(parsed, "caption", "story").units[0]!.sourceTokenIds.length, 3);
  for (const body of ['<|>', '< | >', '<@{beat!}|>', '<...|>']) {
    assert.throws(() => parseScript("empty", `<intro>${body}</intro>`), /omitted speech must contain spoken text/u);
  }
  assert.throws(() => parseScript("cue", '<intro><动效|动||效></intro>'), /Cue break cannot occur inside/u);
  assert.throws(() => parseScript("explicit", '<intro><@{bad} 字|word></intro>'), /spoken text, not the Dual display side/u);
});

test("a Cue break before the final Segment close folds into that boundary", () => {
  const cueSizes = (source: string) =>
    captionDocument(parseScript("cue", source), "caption", "story").cues.map((cue) => cue.unitIds.length);
  assert.deepEqual(cueSizes("<a>one two ||</a><b>three</b>"), [2, 1]);
  assert.deepEqual(cueSizes("<a>one</a><b>two three ||</b>"), [1, 2]);
  assert.deepEqual(cueSizes("<a>one two ||</a>"), [2]);
  assert.deepEqual(cueSizes("<a>one two</a>"), [2]);
});

test("Script exports Narrative and CaptionDocument as independent views from one source", () => {
  const source = `<script id="story">${body}</script>`;
  const result = decodeScriptSurface({ sourceName: "views.svml", source, tag: "script",
    attributes: { id: "story" }, openingStart: 0, contentStart: source.indexOf(">") + 1 });
  const root = result.records.find((record) => record.id === "story")!;
  const caption = result.records.find((record) => record.id === "story.caption")!;
  assert.equal(root.value.kind, "inline");
  assert.equal(caption.value.kind, "inline");
  if (root.value.kind !== "inline" || caption.value.kind !== "inline") return;
  const narrative = root.value.value as unknown as Narrative;
  const document = caption.value.value as unknown as CaptionDocument;
  assertNarrativeIdentity(narrative);
  assert.equal("caption" in narrative, false);
  assert.match(document.words.map((word) => word.text).join(""), /hypit/);
  assert.match(document.words.map((word) => word.text).join(""), /声工坊/);
  assert.ok(!document.words.some((word) => word.text.includes("indeed")));
  assert.ok(narrative.tokens.some((token) => token.text === "indeed"));
  assert.equal(document.cues.length, 2);
});

test("Narrative selections query authored speech while Caption preserves display correspondence", () => {
  const narrative = authored();
  const parsed = parseScript("views.svml", body);
  const document = captionDocument(parsed, "story.caption", "story");
  const binding = narrativeCaptionBinding(parsed, "story.caption", "story");
  const brand = narrative.selections.find((selection) => selection.id === "brand")!;
  assert.equal(narrativeTokensForSelection(narrative, brand).map((token) => token.text).join(" "), "Hai-Pit");
  const name = narrative.selections.find((selection) => selection.id === "name")!;
  const selected = new Set(captionUnitsForNarrativeSelection(document, binding, narrative, name).unitIds);
  assert.equal(document.words.filter((word) => selected.has(word.unitId)).map((word) => word.text).join(""), "声工坊");
  const unit = document.units.find((unit) => selected.has(unit.id))!;
  const bound = binding.units.find((candidate) => candidate.unitId === unit.id)!;
  const first = narrative.tokens.find((token) => token.id === bound.sourceTokenIds[0])!;
  const last = narrative.tokens.find((token) => token.id === bound.sourceTokenIds.at(-1))!;
  assert.notEqual(first.id, last.id);
  assert.throws(() => captionUnitsForNarrativeSelection(document, binding, narrative, {
    id: "partial", startAnchorId: first.endAnchorId, endAnchorId: last.endAnchorId,
  }), /partially selects/);
  const foreign: NarrativeSelectionRef = { ...brand, narrativeId: "other" };
  assert.throws(() => narrativeTokensForSelection(narrative, foreign), /another Narrative/);
});

test("Content queries preserve structural boundaries even when no words lie between them", () => {
  const narrative = authored();
  const gap = narrative.segments.find((segment) => segment.id === "gap")!;
  assert.deepEqual(narrativeTokensForSelection(narrative, { id: "gap", startAnchorId: gap.startAnchorId, endAnchorId: gap.endAnchorId }), []);
  assert.equal(narrativeAnchorTokenBoundary(narrative, gap.startAnchorId), narrativeAnchorTokenBoundary(narrative, gap.endAnchorId));
  assert.throws(() => narrativeSelectionTokenRange(narrative, { id: "backwards", startAnchorId: gap.endAnchorId, endAnchorId: gap.startAnchorId }), /anchor order/);
  const first = narrative.segments[0]!;
  const last = narrative.segments.at(-1)!;
  assert.deepEqual(narrativeTokensForSelection(narrative, {
    id: "whole", startAnchorId: first.startAnchorId, endAnchorId: last.endAnchorId,
  }), narrative.tokens);
});
