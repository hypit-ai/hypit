import assert from "node:assert/strict";
import test from "node:test";

import type { CaptionProgram, TimedCaptionProjection } from "@hypit/caption";
import type { FontArtifactRef } from "@hypit/media";
import { sealProgramSpace } from "@hypit/program-space";
import { captionDocument, parseScript } from "@hypit/script";
import type { SvsRecipe } from "@hypit/svs";

import { fixtureDigest } from "../../../test/fixture-digest.js";
import {
  fineCaptionParameters,
  fineCaptionStyle,
  renderFineCaption,
  scheduleFineCaption,
} from "../src/index.js";

const font: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    digest: fixtureDigest("caption-fine-font"),
    size: 1_024,
    mediaType: "font/woff2",
  } }],
  weight: 800,
  style: "normal",
};

const recipe: SvsRecipe = {
  path: "caption.base",
  properties: {
    "stack-order": 70,
    x: 0.5,
    y: 0.9,
    width: 0.8,
    height: 0.24,
    "anchor-x": "center",
    "anchor-y": "bottom",
    align: "center",
    "block-align": "end",
    "inline-size": "fixed",
    wrap: "word",
    "max-lines": 2,
    "max-words-per-line": 1,
    size: 56,
    "line-height": 1.05,
    fill: "#FFFFFF",
    "stroke-width": 2,
    "shadow-color": "#000000",
    "shadow-opacity": 0.7,
    "shadow-blur": 8,
    "shadow-spread": 1,
    background: "#000000CC",
    padding: "8 12",
    radius: 10,
    "cue-shadow-color": "#000000",
    "cue-shadow-opacity": 0.4,
    "cue-shadow-y": 4,
    "cue-shadow-blur": 10,
    "lead-frames": 4,
    "tail-frames": 6,
    handoff: "cut",
  },
};

function fixture() {
  const parsed = parseScript("caption-fine.svml", "<line>one two || three four</line>");
  const document = captionDocument(parsed, "story.caption", "story");
  const style = fineCaptionStyle("plain", recipe, [font]);
  const program: CaptionProgram = {
    id: "captions",
    documentId: document.id,
    styles: [style],
    runs: [{ id: "captions:run:1", styleId: style.id, unitIds: document.units.map((unit) => unit.id) }],
    wordRuns: [],
    mutedUnitIds: [],
  };
  const [first, second, third, fourth] = document.units;
  assert.ok(first && second && third && fourth);
  const projection: TimedCaptionProjection = {
    spaceId: "test-space",
    narrativeId: "story",
    documentId: document.id,
    cues: [
      {
        id: "captions:cue:1", styleId: style.id, startFrame: 10, endFrameExclusive: 30,
        units: [
          { unitId: first.id, startFrame: 10, endFrameExclusive: 20 },
          { unitId: second.id, startFrame: 20, endFrameExclusive: 30 },
        ],
      },
      {
        id: "captions:cue:2", styleId: style.id, startFrame: 36, endFrameExclusive: 56,
        units: [
          { unitId: third.id, startFrame: 36, endFrameExclusive: 46 },
          { unitId: fourth.id, startFrame: 46, endFrameExclusive: 56 },
        ],
      },
    ],
  };
  return { document, program, projection };
}

test("Fine Caption freezes complete Where, How and visible-envelope parameters", () => {
  const parameters = fineCaptionParameters(recipe, [font]);
  assert.deepEqual(parameters.placement, {
    x: 0.5, y: 0.9, width: 0.8, height: 0.24, anchorX: "center", anchorY: "bottom",
  });
  assert.equal(parameters.layout.maxLines, 2);
  assert.equal(parameters.layout.maxWordsPerLine, 1);
  assert.equal(parameters.typography.exactFonts[0]?.weight, 800);
  assert.equal(parameters.basePaint.shadow.spreadPx, 1);
  assert.deepEqual(parameters.timing, { leadFrames: 4, tailFrames: 6, handoff: "cut" });

});

test("Fine Caption schedules visibility outside semantic Word timing and cuts only the handoff", () => {
  const { document, program, projection } = fixture();
  const schedule = scheduleFineCaption(projection, program, document);
  assert.deepEqual(schedule.cues.map((cue) => ({
    semantic: [cue.semanticStartFrame, cue.semanticEndFrameExclusive],
    visible: [cue.visibleStartFrame, cue.visibleEndFrameExclusive],
  })), [
    { semantic: [10, 30], visible: [6, 36] },
    { semantic: [36, 56], visible: [36, 62] },
  ]);

  const track = renderFineCaption(schedule, program, document,
    sealProgramSpace({ id: "test-space", narrativeId: "story", durationSec: 3, frameRate: { numerator: 30, denominator: 1 } }));
  assert.deepEqual(track.presents.map((present) => present.span), [
    { startFrame: 6, endFrameExclusive: 36 },
    { startFrame: 36, endFrameExclusive: 62 },
  ]);
  assert.ok(track.presents[0]?.elements.some((element) => element.id === "line-break-1"));
  const cue = track.presents[0]?.elements.find((element) => element.id === "cue");
  assert.equal(cue?.style.find((declaration) => declaration.name === "overflow")?.value, "visible");
  assert.equal(cue?.style.some((declaration) => declaration.name === "max-height"), false);
  const atom = track.presents[0]?.elements.find((element) => element.id === "atom-1");
  assert.equal(atom?.style.find((declaration) => declaration.name === "white-space")?.value, "normal");
  assert.equal(atom?.style.find((declaration) => declaration.name === "overflow-wrap")?.value, "anywhere");
});

test("Fine Caption rejects a Cue that exceeds its structural row budget instead of clipping Paint", () => {
  const { document, program, projection } = fixture();
  const constrained = fineCaptionStyle("plain", {
    ...recipe,
    properties: { ...recipe.properties, "max-lines": 1 },
  }, [font]);
  const constrainedProgram: CaptionProgram = { ...program, styles: [constrained] };
  const schedule = scheduleFineCaption(projection, constrainedProgram, document);
  assert.throws(
    () => renderFineCaption(schedule, constrainedProgram, document,
      sealProgramSpace({ id: "test-space", narrativeId: "story", durationSec: 3,
        frameRate: { numerator: 30, denominator: 1 } })),
    /constructs 2 rows.+maximum is 1/u,
  );
});

test("Fine Caption applies authored mute before it schedules the visible envelope", () => {
  const { document, program, projection } = fixture();
  const muted: CaptionProgram = { ...program, mutedUnitIds: [projection.cues[0]!.units[0]!.unitId] };
  const schedule = scheduleFineCaption(projection, muted, document);
  assert.deepEqual(schedule.cues[0]?.units, [projection.cues[0]!.units[1]]);
  assert.equal(schedule.cues[0]?.semanticStartFrame, projection.cues[0]!.units[1]!.startFrame);
});

test("Fine Caption rejects token-specific Style runs instead of disguising a structural caption", () => {
  const { document, program, projection } = fixture();
  const word = document.words[0]!;
  const styled: CaptionProgram = {
    ...program,
    wordRuns: [{ id: "captions:word-run:1", styleId: "plain", wordIds: [word.id] }],
  };
  assert.throws(
    () => scheduleFineCaption(projection, styled, document),
    /one uniform token rule/u,
  );
});
