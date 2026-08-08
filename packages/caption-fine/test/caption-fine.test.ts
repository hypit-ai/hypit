import assert from "node:assert/strict";
import test from "node:test";

import { resolveCaptionProgram } from "@narratage/caption";
import type { TimedCaptionProjection } from "@narratage/caption";
import { fineCaptionStyle, renderFineCaption } from "@narratage/caption-fine";
import { sealProgramSpace } from "@narratage/program-space";
import { captionWordSequence, parseScript } from "@narratage/script";
import type { SvsRecipe } from "@narratage/svs";

const recipe: SvsRecipe = {
  contract: "svml.svs-recipe@1",
  path: "caption.primary",
  properties: {
    "cue-min-words": 1,
    "cue-max-words": 5,
    "important-min-per-cue": 0,
    "important-max-per-cue": 2,
    "important-fill": "#FFE044",
    "important-scale": 1.15,
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

test("one Fine renderer handles the default Style, per-word fields and one peer VisualTrack", () => {
  const narrative = parseScript("fine.svml", "<line>Meaning becomes visible.</line>");
  const words = captionWordSequence(narrative, "story.caption.words");
  const style = fineCaptionStyle("primary", recipe);
  const program = resolveCaptionProgram(words, "captions", style, []);
  const wordIds = words.words.map((word) => word.id);
  const projection: TimedCaptionProjection = {
    contract: "svml.timed-caption-projection@1",
    text: "Meaning becomes visible.",
    regions: [{
      id: "cue:1",
      runId: program.runs[0]!.id,
      styleId: style.id,
      display: "Meaning becomes visible.",
      segmentId: "line",
      kind: "identity",
      sourceTokenIds: narrative.tokens.map((token) => token.id),
      startSec: 0,
      endSec: 2,
      refinements: [],
      wordIds,
      fields: [{ declarationId: "important", wordId: wordIds[1]!, value: "true" }],
    }],
  };
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 2,
    frameRate: { numerator: 30, denominator: 1 },
  });
  const track = renderFineCaption(projection, program, words, space);
  assert.equal(track.contract, "svml.visual-track@1");
  assert.equal(track.presents.length, 1);
  const wordElements = track.presents[0]!.elements.filter((element) => element.kind === "text");
  assert.equal(wordElements.length, 3);
  assert.deepEqual(wordElements.map((element) => element.kind === "text" ? element.text : undefined),
    ["Meaning ", "becomes ", "visible."]);
  assert.equal(wordElements[1]!.style.some((declaration) =>
    declaration.name === "color" && declaration.value === "#FFE044"), true);
  assert.equal(wordElements[0]!.style.some((declaration) => declaration.name === "transform"), false);
});
