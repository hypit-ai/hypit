import assert from "node:assert/strict";
import test from "node:test";

import { resolveCaptionProgram } from "@narratage/caption";
import type { TimedCaptionProjection } from "@narratage/caption";
import { fineCaptionStyle, renderFineCaption } from "@narratage/caption-fine";
import { sealProgramSpace } from "@narratage/program-space";
import { captionDisplaySequence, parseScript } from "@narratage/script";
import type { SvsRecipe } from "@narratage/svs";

const recipe: SvsRecipe = {
  contract: "svml.svs-recipe@1",
  path: "caption.primary",
  properties: {
    "cue-min-words": 1,
    "cue-max-words": 5,
    "stack-order": 70,
    x: 0.08,
    y: 0.76,
    width: 0.84,
    font: "Inter",
    weight: 800,
    size: 58,
    "line-height": 1,
    align: "center",
    fill: "#FFFFFF",
    background: "#09090BCC",
    padding: "16 24",
    radius: 18,
  },
};

test("one Fine renderer handles uniform Cue appearance as one peer VisualTrack", () => {
  const narrative = parseScript("fine.svml", "<line>Meaning becomes visible.</line>");
  const display = captionDisplaySequence(narrative, "story.caption");
  const style = fineCaptionStyle("primary", recipe);
  const program = resolveCaptionProgram(display, "captions", style, []);
  const projection: TimedCaptionProjection = {
    contract: "svml.timed-caption-projection@1",
    displaySequenceId: display.id,
    cues: [{
      id: "cue:1",
      runId: program.runs[0]!.id,
      styleId: style.id,
      segmentId: "line",
      startSec: 0,
      endSec: 2,
      atoms: display.atoms.map((atom) => ({ atomId: atom.id, startSec: 0, endSec: 2 })),
      fields: [],
    }],
  };
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 2,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const track = renderFineCaption(projection, program, display, space);
  assert.equal(track.contract, "svml.visual-track@1");
  assert.equal(track.presents.length, 1);
  const wordElements = track.presents[0]!.elements.filter((element) => element.kind === "text");
  assert.equal(wordElements.length, 3);
  assert.deepEqual(wordElements.map((element) => element.kind === "text" ? element.text : undefined),
    ["Meaning ", "becomes ", "visible."]);
  assert.equal(wordElements.every((element) => element.style.some((declaration) =>
    declaration.name === "color" && declaration.value === "#FFFFFF")), true);
  assert.equal(wordElements.every((element) =>
    element.style.every((declaration) => declaration.name !== "transform")), true);
});
