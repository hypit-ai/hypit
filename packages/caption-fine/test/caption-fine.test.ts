import assert from "node:assert/strict";
import test from "node:test";

import { resolveCaptionProgram } from "@narratage/caption";
import type { TimedCaptionProjection } from "@narratage/caption";
import { fineCaptionParameters, fineCaptionStyle, renderFineCaption } from "@narratage/caption-fine";
import type { FontArtifactRef } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
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

const exactFont: FontArtifactRef = {
  contract: "svml.font-artifact@1",
  sources: [{ artifact: { kind: "blob", digest: digestOf("caption-fine:test-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 800,
  style: "normal",
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
    ["Meaning", "becomes", "visible."]);
  assert.equal(wordElements.every((element) => element.style.some((declaration) =>
    declaration.name === "color" && declaration.value === "#FFFFFF")), true);
  assert.equal(wordElements.every((element) =>
    element.style.every((declaration) => declaration.name !== "transform")), true);
  assert.equal(fineCaptionParameters(recipe).activePaint.fill, "#FFD54A");
});

test("Fine resolves the complete orthogonal Paint, anchor, karaoke and motion surface", () => {
  const parameters = fineCaptionParameters({
    ...recipe,
    properties: {
      ...recipe.properties,
      "anchor-x": "center",
      "anchor-y": "bottom",
      direction: "rtl",
      "letter-spacing": -1.5,
      "word-gap": 11,
      "font-style": "italic",
      opacity: 0.9,
      "stroke-color": "#101010",
      "stroke-width": 3,
      "shadow-color": "#000000",
      "shadow-opacity": 0.75,
      "shadow-x": 2,
      "shadow-y": 4,
      "shadow-blur": 8,
      "glow-color": "#5CE1E6",
      "glow-opacity": 0.6,
      "glow-blur": 12,
      "border-color": "#FFFFFF80",
      "border-width": 2,
      karaoke: "trail",
      "karaoke-transition": "wipe",
      "active-fill": "#FFDD00",
      "active-opacity": 0.95,
      "active-stroke-color": "#401000",
      "active-stroke-width": 1,
      "active-shadow-color": "#FF8800",
      "active-shadow-opacity": 0.5,
      "active-shadow-x": 0,
      "active-shadow-y": 2,
      "active-shadow-blur": 5,
      "active-glow-color": "#FFFFFF",
      "active-glow-opacity": 0.7,
      "active-glow-blur": 10,
      "cue-enter": "fade",
      "cue-exit": "fade",
      "cue-transition-frames": 6,
      "atom-reveal": "on-start",
      "active-scale": 1.08,
    },
  });

  assert.deepEqual(parameters.placement, {
    x: 0.08, y: 0.76, width: 0.84, anchorX: "center", anchorY: "bottom",
  });
  assert.equal(parameters.layout.direction, "rtl");
  assert.equal(parameters.typography.fontStyle, "italic");
  assert.equal(parameters.basePaint.stroke.widthPx, 3);
  assert.equal(parameters.basePaint.glow.blurPx, 12);
  assert.equal(parameters.activePaint.fill, "#FFDD00");
  assert.equal(parameters.activePaint.shadow.offsetYPx, 2);
  assert.deepEqual(parameters.karaoke, { mode: "trail", transition: "wipe" });
  assert.deepEqual(parameters.motion, {
    cueEnter: "fade", cueExit: "fade", cueTransitionFrames: 6, atomReveal: "on-start", activeScale: 1.08,
  });
});

test("karaoke uses one active overlay per whole Atom and never invents Dual Text word timing", () => {
  const narrative = parseScript("karaoke.svml", "<line>Hello <New York City | new york city> today.</line>");
  const display = captionDisplaySequence(narrative, "story.caption");
  const style = fineCaptionStyle("karaoke", {
    ...recipe,
    properties: {
      ...recipe.properties,
      karaoke: "trail",
      "karaoke-transition": "wipe",
      "active-fill": "#FFD54A",
      "atom-reveal": "on-start",
      "active-scale": 1.04,
      "cue-enter": "fade",
      "cue-exit": "fade",
      "cue-transition-frames": 4,
    },
  });
  const program = resolveCaptionProgram(display, "karaoke-captions", style, []);
  const projection: TimedCaptionProjection = {
    contract: "svml.timed-caption-projection@1",
    displaySequenceId: display.id,
    cues: [{
      id: "cue:karaoke",
      runId: program.runs[0]!.id,
      styleId: style.id,
      segmentId: "line",
      startSec: 0,
      endSec: 3,
      atoms: display.atoms.map((atom, index) => ({ atomId: atom.id, startSec: index, endSec: index + 1 })),
      fields: [],
    }],
  };
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 3,
    frameRate: { numerator: 30, denominator: 1 },
  });

  const track = renderFineCaption(projection, program, display, space);
  const elements = track.presents[0]!.elements;
  const dualAtom = display.atoms.find((atom) => atom.wordIds.length === 3)!;
  const dualContainer = elements.find((element) =>
    element.attributes?.some((attribute) => attribute.name === "data-caption-atom" && attribute.value === dualAtom.id));
  assert.ok(dualContainer);
  const activeLayer = elements.find((element) => element.parent === dualContainer.id
    && element.attributes?.some((attribute) => attribute.name === "data-caption-karaoke"));
  assert.ok(activeLayer?.animation);
  assert.equal(activeLayer.animation.keyframes.some((keyframe) => keyframe.style.some((item) =>
    item.name === "clip-path" && String(item.value).includes("inset"))), true);
  assert.equal(elements.filter((element) => element.parent === activeLayer.id && element.kind === "text").length, 3);
  assert.equal(elements.filter((element) => element.attributes?.some((attribute) =>
    attribute.name === "data-caption-karaoke")).length, display.atoms.length);
});

test("Fine rejects unknown or obsolete Recipe dimensions instead of silently accepting them", () => {
  assert.throws(() => fineCaptionStyle("bad", {
    ...recipe,
    properties: { ...recipe.properties, important: true },
  }), /unknown property important/u);
});

test("an exact Font is explicit Style input and reaches every base and active glyph", () => {
  const narrative = parseScript("font.svml", "<line>Exact words.</line>");
  const display = captionDisplaySequence(narrative, "font.caption");
  const style = fineCaptionStyle("font", {
    ...recipe,
    properties: { ...recipe.properties, karaoke: "current", "active-fill": "#FFD54A" },
  }, [exactFont]);
  const program = resolveCaptionProgram(display, "font-program", style, []);
  const projection: TimedCaptionProjection = {
    contract: "svml.timed-caption-projection@1",
    displaySequenceId: display.id,
    cues: [{
      id: "cue:font", runId: program.runs[0]!.id, styleId: style.id, segmentId: "line",
      startSec: 0, endSec: 1,
      atoms: display.atoms.map((atom) => ({ atomId: atom.id, startSec: 0, endSec: 1 })),
      fields: [],
    }],
  };
  const space = sealProgramSpace({
    contract: "svml.program-space@1", durationSec: 1, frameRate: { numerator: 30, denominator: 1 },
  });
  const track = renderFineCaption(projection, program, display, space);
  const glyphs = track.presents[0]!.elements.filter((element) => element.kind === "text");
  assert.ok(glyphs.length > display.words.length);
  assert.equal(glyphs.every((element) => element.kind === "text" && element.fonts?.length === 1), true);
  for (const glyph of glyphs) {
    if (glyph.kind === "text") assert.deepEqual(glyph.fonts, [exactFont]);
  }
  assert.throws(() => fineCaptionStyle("mismatch", recipe, [{ ...exactFont, weight: 700 }]), /must match/u);
});

test("an ordered exact Font stack preserves honest fallback faces and rejects duplicates", () => {
  const fallback: FontArtifactRef = {
    ...exactFont,
    sources: [{ artifact: { ...exactFont.sources[0]!.artifact, digest: digestOf("caption-fine:test-fallback") } }],
    weight: 400,
  };
  const parameters = fineCaptionParameters(recipe, [exactFont, fallback]);
  assert.deepEqual(parameters.typography.exactFonts, [exactFont, fallback]);
  assert.throws(() => fineCaptionParameters(recipe, [exactFont, exactFont]), /duplicate face/u);
  assert.doesNotThrow(() => fineCaptionParameters(recipe, [exactFont, { ...fallback, style: "italic" }]));
});

test("current/trail by step/wipe have four distinct frame-exact Atom histories", () => {
  const narrative = parseScript("modes.svml", "<line>First second.</line>");
  const display = captionDisplaySequence(narrative, "story.caption");
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 2,
    frameRate: { numerator: 10, denominator: 1 },
  });
  const render = (mode: "current" | "trail", transition: "step" | "wipe") => {
    const style = fineCaptionStyle(`${mode}-${transition}`, {
      ...recipe,
      properties: { ...recipe.properties, karaoke: mode, "karaoke-transition": transition },
    });
    const program = resolveCaptionProgram(display, `program-${mode}-${transition}`, style, []);
    const projection: TimedCaptionProjection = {
      contract: "svml.timed-caption-projection@1",
      displaySequenceId: display.id,
      cues: [{
        id: "cue:modes",
        runId: program.runs[0]!.id,
        styleId: style.id,
        segmentId: "line",
        startSec: 0,
        endSec: 2,
        atoms: display.atoms.map((atom, index) => ({ atomId: atom.id, startSec: index, endSec: index + 1 })),
        fields: [],
      }],
    };
    const track = renderFineCaption(projection, program, display, space);
    return track.presents[0]!.elements.find((element) => element.id === "atom-1-active")!.animation!.keyframes;
  };
  const at = (keyframes: ReturnType<typeof render>, frame: number, property: string) =>
    keyframes.find((keyframe) => keyframe.atFrame === frame)!.style.find((item) => item.name === property)!.value;

  const currentStep = render("current", "step");
  assert.equal(at(currentStep, 0, "opacity"), 1);
  assert.equal(at(currentStep, 10, "opacity"), 0);
  const trailStep = render("trail", "step");
  assert.equal(at(trailStep, 0, "opacity"), 1);
  assert.equal(at(trailStep, 20, "opacity"), 1);

  const currentWipe = render("current", "wipe");
  assert.equal(at(currentWipe, 0, "clip-path"), "inset(0 100% 0 0)");
  assert.equal(at(currentWipe, 9, "clip-path"), "inset(0 0% 0 0)");
  assert.equal(at(currentWipe, 10, "clip-path"), "inset(0 100% 0 0)");
  const trailWipe = render("trail", "wipe");
  assert.equal(at(trailWipe, 0, "clip-path"), "inset(0 100% 0 0)");
  assert.equal(at(trailWipe, 10, "clip-path"), "inset(0 0% 0 0)");
  assert.equal(at(trailWipe, 20, "clip-path"), "inset(0 0% 0 0)");
});
