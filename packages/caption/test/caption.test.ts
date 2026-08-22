import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize } from "@hypit/protocol";
import {
  assertCaptionProgramForDocument,
  captionUnitsForSelection,
  resolveCaptionProgram,
  sealCaptionStyle,
} from "@hypit/caption";
import { captionDocument, narrativeValue, parseScript } from "@hypit/script";
import type { Narrative } from "@hypit/narrative";

test("Caption uses complete semantic selections and authored cue breaks", () => {
  const parsed = parseScript("caption.svml", "<line>one @focus two three @/focus || four</line>");
  const narrative = narrativeValue(parsed) as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption");
  const selection = narrative.selections[0]!;
  const subset = captionUnitsForSelection(document, narrative, selection);
  assert.equal(subset.unitIds.length, 2);
  const style = sealCaptionStyle({ id: "plain", rendering: { family: "test", parameters: canonicalize({}) } });
  const program = resolveCaptionProgram(document, narrative, "captions", style, [], []);
  assertCaptionProgramForDocument(program, document);
  assert.equal(document.cueBreaks.length, 1);
});

test("Caption keeps Selection styles and adds flat word-attribute styles separately", () => {
  const parsed = parseScript("caption-attributes.svml", "<line>@focus really{emphasis} matters @/focus</line>");
  const narrative = narrativeValue(parsed) as unknown as Narrative;
  const document = captionDocument(parsed, "story.caption");
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
