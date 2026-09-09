import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize } from "@hypit/protocol";
import {
  assertCaptionProgramForDocument,
  captionUnitsForRole,
  captionUnitsForSelection,
  resolveCaptionProgram,
  sealCaptionStyle,
} from "@hypit/caption";
import { captionDocument, narrativeValue, parseScript } from "@hypit/script";
import type { Narrative } from "@hypit/narrative";

test("Caption uses complete semantic selections and authored cue breaks", () => {
  const parsed = parseScript("caption.svml", "<line>one @focus two three @/focus || four</line>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const selection = narrative.selections[0]!;
  const subset = captionUnitsForSelection(document, narrative, selection);
  assert.equal(subset.unitIds.length, 2);
  const style = sealCaptionStyle({ id: "plain", rendering: { family: "test", parameters: canonicalize({}) } });
  const program = resolveCaptionProgram(document, narrative, "captions", style, [], []);
  assertCaptionProgramForDocument(program, document);
  assert.equal(document.cueBreaks.length, 1);
});

test("Caption styles one Role across non-contiguous authored Cues", () => {
  const parsed = parseScript("caption-roles.svml", "<line><GUY>one || <GIRL>two || <GUY>three</line>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const plain = sealCaptionStyle({ id: "plain", rendering: { family: "test", parameters: canonicalize({}) } });
  const guy = sealCaptionStyle({ id: "guy", rendering: { family: "test", parameters: canonicalize({}) } });
  const program = resolveCaptionProgram(
    document,
    narrative,
    "captions",
    plain,
    [{ id: "guy-role", unitIds: captionUnitsForRole(document, "GUY").unitIds, style: guy }],
  );
  assertCaptionProgramForDocument(program, document);
  assert.deepEqual(program.runs.map((run) => run.styleId), ["guy", "plain", "guy"]);
});

test("Caption selects complete Segments and the program through structural anchors", () => {
  const parsed = parseScript("caption-ranges.svml", `~@whole
@opening <intro><HOST>One idea.</intro> @/opening
<answer><GUEST>Another view.</answer>
@/whole~`);
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const whole = narrative.selections.find((selection) => selection.id === "whole")!;
  const opening = narrative.selections.find((selection) => selection.id === "opening")!;
  assert.deepEqual(captionUnitsForSelection(document, narrative, whole).unitIds,
    document.units.map((unit) => unit.id));
  assert.deepEqual(captionUnitsForSelection(document, narrative, opening).unitIds,
    document.units.filter((unit) => unit.segmentId === "intro").map((unit) => unit.id));
});

test("Caption applications use authored order and styling does not undo a display mute", () => {
  const parsed = parseScript("caption-coverage.svml",
    "<line><HOST>First. <GUEST>@answer Another view. @/answer</line>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const makeStyle = (id: string) => sealCaptionStyle({ id, rendering: { family: "test", parameters: {} } });
  const base = makeStyle("base"), guest = makeStyle("guest"), accent = makeStyle("accent");
  const selected = captionUnitsForSelection(document, narrative, narrative.selections[0]!).unitIds;
  const roleUse = { id: "guest-role", unitIds: captionUnitsForRole(document, "GUEST").unitIds, style: guest };
  const rangeUse = { id: "answer-range", unitIds: selected, style: accent };
  const resolve = (applications: typeof roleUse[]) => resolveCaptionProgram(document, narrative, "captions",
    base, applications, [{ id: "hidden-answer", unitIds: selected }]);
  const rangeLast = resolve([roleUse, rangeUse]);
  assert.deepEqual(rangeLast.runs.map((run) => run.styleId), ["base", "accent"]);
  const roleLast = resolve([rangeUse, roleUse]);
  assert.deepEqual(roleLast.runs.map((run) => run.styleId), ["base", "guest"]);
  assert.deepEqual(rangeLast.mutedUnitIds, selected);
  assert.deepEqual(roleLast.mutedUnitIds, selected);
});

test("Caption keeps Selection styles and adds flat word-attribute styles separately", () => {
  const parsed = parseScript("caption-attributes.svml", "<line>@focus really{emphasis} matters @/focus</line>");
  const narrative = narrativeValue(parsed, "story") as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption", "story");
  const plain = sealCaptionStyle({ id: "plain", rendering: { family: "test", parameters: canonicalize({ level: "plain" }) } });
  const emphasis = sealCaptionStyle({ id: "emphasis", rendering: { family: "test", parameters: canonicalize({ level: "emphasis" }) } });
  const selection = narrative.selections[0]!;
  const program = resolveCaptionProgram(
    document,
    narrative,
    "captions",
    plain,
    [{ id: "selection", unitIds: captionUnitsForSelection(document, narrative, selection).unitIds, style: plain }],
    [],
    [{ id: "word", attribute: "emphasis", wordIds: [document.words[1]!.id], style: emphasis }],
  );
  assert.equal(program.runs.length, 1);
  assert.deepEqual(program.wordRuns, [{ id: "captions:word-run:1", styleId: "emphasis", wordIds: [document.words[1]!.id] }]);
});
