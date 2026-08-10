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
  const style = fineCaptionStyle("primary", recipe, [exactFont]);
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
  assert.equal(fineCaptionParameters(recipe, [exactFont]).activePaint.fill, "#FFD54A");
});

test("Fine applies Caption Mute after planning without regrouping Cues", () => {
  const narrative = parseScript("mute.svml", "<line>Keep hidden words visible.</line>");
  const display = captionDisplaySequence(narrative, "story.caption");
  const style = fineCaptionStyle("primary", recipe, [exactFont]);
  const muted = display.words.slice(1, 3);
  const program = resolveCaptionProgram(display, "captions", style, [], [{
    id: "hide-middle",
    words: {
      contract: "svml.caption-display-word-subset@1",
      id: "selection:hide-middle",
      sequenceId: display.id,
      wordIds: muted.map((word) => word.id),
    },
  }]);
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
      atoms: display.atoms.map((atom, index) => ({
        atomId: atom.id,
        startSec: index * 0.4,
        endSec: index * 0.4 + 0.3,
      })),
      fields: [],
    }],
  };
  const space = sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 2,
    frameRate: { numerator: 30, denominator: 1 },
  });

  const track = renderFineCaption(projection, program, display, space);
  assert.equal(track.presents.length, 1);
  assert.deepEqual(track.presents[0]!.span, { startFrame: 0, endFrameExclusive: 60 });
  const renderedWords = track.presents[0]!.elements
    .filter((element) => element.kind === "text")
    .map((element) => element.kind === "text" ? element.text : undefined);
  assert.deepEqual(renderedWords, ["Keep", "visible."]);
});

test("Fine emits no Present for a fully muted Cue", () => {
  const narrative = parseScript("mute-all.svml", "<line>Hide everything.</line>");
  const display = captionDisplaySequence(narrative, "story.caption");
  const style = fineCaptionStyle("primary", recipe, [exactFont]);
  const program = resolveCaptionProgram(display, "captions", style, [], [{
    id: "hide-all",
    words: {
      contract: "svml.caption-display-word-subset@1",
      id: "all",
      sequenceId: display.id,
      wordIds: display.words.map((word) => word.id),
    },
  }]);
  const projection: TimedCaptionProjection = {
    contract: "svml.timed-caption-projection@1",
    displaySequenceId: display.id,
    cues: [{
      id: "cue:1",
      runId: program.runs[0]!.id,
      styleId: style.id,
      segmentId: "line",
      startSec: 0,
      endSec: 1,
      atoms: display.atoms.map((atom) => ({ atomId: atom.id, startSec: 0, endSec: 1 })),
      fields: [],
    }],
  };
  const track = renderFineCaption(projection, program, display, sealProgramSpace({
    contract: "svml.program-space@1",
    durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 },
  }));
  assert.deepEqual(track.presents, []);
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
      "text-transform": "uppercase",
      opacity: 0.9,
      "gradient-from": "#FFFFFF",
      "gradient-to": "#55CCFF",
      "gradient-angle": 120,
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
      "long-shadow-color": "#111827",
      "long-shadow-opacity": 0.45,
      "long-shadow-distance": 14,
      "long-shadow-angle": 35,
      underline: "always",
      "underline-color": "#A7F3D0",
      "underline-thickness": 3,
      "underline-offset": 6,
      "border-color": "#FFFFFF80",
      "border-width": 2,
      karaoke: "trail",
      "karaoke-transition": "wipe",
      "active-fill": "#FFDD00",
      "active-gradient-from": "#FFF176",
      "active-gradient-to": "#FF6F00",
      "active-gradient-angle": 90,
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
      "active-long-shadow-color": "#7C2D12",
      "active-long-shadow-opacity": 0.5,
      "active-long-shadow-distance": 8,
      "active-long-shadow-angle": 45,
      "active-underline": "current",
      "active-underline-color": "#FFFFFF",
      "active-underline-thickness": 4,
      "active-underline-offset": 7,
      "active-box": "trail",
      "active-box-continuity": "joined",
      "active-box-background": "#FACC15CC",
      "active-box-border-color": "#FFFFFF80",
      "active-box-border-width": 2,
      "active-box-padding": "5 9",
      "active-box-radius": 10,
      "active-box-enter": "pop",
      "active-box-exit": "fade",
      "active-box-transition-frames": 4,
      "cue-enter": "spring",
      "cue-exit": "blur-in",
      "cue-enter-frames": 6,
      "cue-exit-frames": 6,
      "atom-enter": "slide-up",
      "atom-enter-frames": 5,
      "atom-reveal": "typewriter",
      "active-response": "spring",
      "active-response-frames": 7,
      "active-scale": 1.12,
      "slide-distance": 20,
      loop: "wobble",
      "loop-target": "active-atom",
      "loop-period-frames": 14,
      "loop-intensity": 0.8,
    },
  }, [{ ...exactFont, style: "italic" }]);

  assert.deepEqual(parameters.placement, {
    x: 0.08, y: 0.76, width: 0.84, anchorX: "center", anchorY: "bottom",
  });
  assert.equal(parameters.layout.direction, "rtl");
  assert.equal(parameters.typography.exactFonts[0]?.style, "italic");
  assert.equal(parameters.typography.textTransform, "uppercase");
  assert.deepEqual(parameters.basePaint.gradient, { from: "#FFFFFF", to: "#55CCFF", angleDeg: 120 });
  assert.equal(parameters.basePaint.stroke.widthPx, 3);
  assert.equal(parameters.basePaint.glow.blurPx, 12);
  assert.equal(parameters.basePaint.longShadow.distancePx, 14);
  assert.equal(parameters.activePaint.fill, "#FFDD00");
  assert.equal(parameters.activePaint.shadow.offsetYPx, 2);
  assert.equal(parameters.underline.mode, "always");
  assert.equal(parameters.activeUnderline.mode, "current");
  assert.equal(parameters.activeBox.continuity, "joined");
  assert.deepEqual(parameters.activeBox, {
    mode: "trail", continuity: "joined", background: "#FACC15CC", borderColor: "#FFFFFF80",
    borderWidthPx: 2, paddingXPx: 9, paddingYPx: 5, radiusPx: 10,
    enter: "pop", exit: "fade", transitionFrames: 4,
  });
  assert.deepEqual(parameters.karaoke, { mode: "trail", transition: "wipe" });
  assert.deepEqual(parameters.motion, {
    cueEnter: "spring", cueExit: "blur-in", cueEnterFrames: 6, cueExitFrames: 6,
    atomEnter: "slide-up", atomEnterFrames: 5, atomExit: "none", atomExitFrames: 0, atomReveal: "typewriter",
    activeResponse: "spring", activeResponseFrames: 7, activeScale: 1.12, slideDistancePx: 20,
    loop: "wobble", loopTarget: "active-atom", loopPeriodFrames: 14, loopIntensity: 0.8,
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
      "cue-enter-frames": 4,
      "cue-exit-frames": 4,
    },
  }, [exactFont]);
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
  }, [exactFont]), /unknown property important/u);
  assert.throws(() => fineCaptionStyle("half-gradient", {
    ...recipe,
    properties: { ...recipe.properties, "gradient-from": "#FFFFFF" },
  }, [exactFont]), /requires both from and to/u);
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
  assert.doesNotThrow(() => fineCaptionStyle("another-exact-face", recipe, [{ ...exactFont, weight: 700 }]));
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
    }, [exactFont]);
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

test("full Fine Paint and layered motion lower to terminal Visual IR without changing Caption truth", () => {
  const narrative = parseScript("full.svml", "<line>Every authored atom stays intact.</line>");
  const display = captionDisplaySequence(narrative, "full.caption");
  const style = fineCaptionStyle("full", {
    ...recipe,
    properties: {
      ...recipe.properties,
      "text-transform": "uppercase",
      "gradient-from": "#FFFFFF", "gradient-to": "#60A5FA", "gradient-angle": 120,
      "long-shadow-color": "#172554", "long-shadow-opacity": 0.55,
      "long-shadow-distance": 8, "long-shadow-angle": 45,
      underline: "always", "underline-color": "#A7F3D0", "underline-thickness": 2, "underline-offset": 5,
      karaoke: "trail", "karaoke-transition": "wipe",
      "active-gradient-from": "#FDE047", "active-gradient-to": "#F97316", "active-gradient-angle": 90,
      "active-underline": "current", "active-underline-color": "#FFFFFF",
      "active-box": "trail", "active-box-continuity": "joined", "active-box-background": "#F59E0BCC",
      "active-box-padding": "4 7", "active-box-radius": 8,
      "cue-enter": "spring", "cue-enter-frames": 5, "cue-exit": "blur-in", "cue-exit-frames": 5,
      "atom-enter": "slide-up", "atom-enter-frames": 4, "atom-reveal": "typewriter",
      "active-response": "pop", "active-response-frames": 4, "active-scale": 1.12,
      loop: "wobble", "loop-target": "active-atom", "loop-period-frames": 8, "loop-intensity": 1,
    },
  }, [exactFont]);
  const program = resolveCaptionProgram(display, "full-program", style, []);
  const projection: TimedCaptionProjection = {
    contract: "svml.timed-caption-projection@1",
    displaySequenceId: display.id,
    cues: [{
      id: "cue:full", runId: program.runs[0]!.id, styleId: style.id, segmentId: "line",
      startSec: 0, endSec: 4,
      atoms: display.atoms.map((atom, index) => ({ atomId: atom.id, startSec: index, endSec: index + 1 })),
      fields: [],
    }],
  };
  const space = sealProgramSpace({
    contract: "svml.program-space@1", durationSec: 4, frameRate: { numerator: 10, denominator: 1 },
  });
  const elements = renderFineCaption(projection, program, display, space).presents[0]!.elements;
  const base = elements.find((element) => element.id === "atom-1-base-1");
  assert.equal(base?.kind, "text");
  assert.ok(base?.style.some(({ name }) => name === "background-image"));
  assert.ok(base?.style.some(({ name, value }) => name === "text-transform" && value === "uppercase"));
  assert.ok(base?.style.some(({ name }) => name === "text-decoration-thickness"));
  assert.ok(base?.style.some(({ name, value }) => name === "text-shadow" && String(value).split(",").length >= 8));
  const activeGlyph = elements.find((element) => element.id === "atom-1-active-1");
  assert.equal(activeGlyph?.kind, "text");
  assert.ok(activeGlyph?.style.some(({ name }) => name === "background-image"));
  const joined = elements.filter((element) => element.attributes?.some((attribute) =>
    attribute.name === "data-caption-active-box" && attribute.value === "joined"));
  assert.equal(joined.length, display.atoms.length);
  const joinedText = elements.find((element) => element.id === `joined-box-${display.atoms.length}-text`);
  assert.equal(joinedText?.kind, "text");
  assert.ok(joinedText?.style.some(({ name, value }) => name === "box-decoration-break" && value === "clone"));
  assert.ok(elements.find((element) => element.id === "cue-motion")?.animation);
  assert.ok(elements.find((element) => element.id === "atom-1-typewriter")?.animation?.keyframes.some((keyframe) =>
    keyframe.style.some(({ name }) => name === "clip-path")));
  assert.ok(elements.find((element) => element.id === "atom-1-loop")?.animation);
  assert.ok(elements.find((element) => element.id === "atom-1-response")?.animation);
  assert.equal(elements.filter((element) => element.attributes?.some((attribute) =>
    attribute.name === "data-caption-active-underline")).length, display.atoms.length);
});

test("glyph, underline and Pill activation are independent channels", () => {
  const narrative = parseScript("channels.svml", "<line>Read this now.</line>");
  const display = captionDisplaySequence(narrative, "channels.caption");
  const style = fineCaptionStyle("channels", {
    ...recipe,
    properties: {
      ...recipe.properties,
      karaoke: "trail",
      "active-underline": "trail",
      "active-box": "current",
      "active-box-continuity": "joined",
      "active-box-background": "#FFD54ACC",
      "active-box-padding": "3 6",
    },
  }, [exactFont]);
  const program = resolveCaptionProgram(display, "channels-program", style, []);
  const projection: TimedCaptionProjection = {
    contract: "svml.timed-caption-projection@1", displaySequenceId: display.id,
    cues: [{
      id: "cue:channels", runId: program.runs[0]!.id, styleId: style.id, segmentId: "line",
      startSec: 0, endSec: 3,
      atoms: display.atoms.map((atom, index) => ({ atomId: atom.id, startSec: index, endSec: index + 1 })),
      fields: [],
    }],
  };
  const space = sealProgramSpace({
    contract: "svml.program-space@1", durationSec: 3, frameRate: { numerator: 10, denominator: 1 },
  });
  const elements = renderFineCaption(projection, program, display, space).presents[0]!.elements;
  assert.equal(elements.filter((element) => element.attributes?.some((attribute) =>
    attribute.name === "data-caption-karaoke" && attribute.value === "trail")).length, display.atoms.length);
  assert.equal(elements.filter((element) => element.attributes?.some((attribute) =>
    attribute.name === "data-caption-active-underline" && attribute.value === "trail")).length, display.atoms.length);
  const boxes = elements.filter((element) => element.attributes?.some((attribute) =>
    attribute.name === "data-caption-active-box"));
  assert.equal(boxes.length, display.atoms.length);
  assert.equal(boxes.every((element) => element.attributes?.some((attribute) => attribute.value === "isolated")), true);
});

test("every declared one-shot and loop motion lowers through the same wrapper vocabulary", () => {
  const narrative = parseScript("motions.svml", "<line>Motion stays local.</line>");
  const display = captionDisplaySequence(narrative, "motions.caption");
  const space = sealProgramSpace({
    contract: "svml.program-space@1", durationSec: 3, frameRate: { numerator: 10, denominator: 1 },
  });
  const render = (id: string, properties: Readonly<Record<string, string | number>>) => {
    const style = fineCaptionStyle(id, { ...recipe, properties: { ...recipe.properties, ...properties } }, [exactFont]);
    const program = resolveCaptionProgram(display, `${id}-program`, style, []);
    const projection: TimedCaptionProjection = {
      contract: "svml.timed-caption-projection@1", displaySequenceId: display.id,
      cues: [{
        id: `cue:${id}`, runId: program.runs[0]!.id, styleId: style.id, segmentId: "line",
        startSec: 0, endSec: 3,
        atoms: display.atoms.map((atom, index) => ({ atomId: atom.id, startSec: index, endSec: index + 1 })),
        fields: [],
      }],
    };
    return renderFineCaption(projection, program, display, space).presents[0]!.elements;
  };
  for (const kind of [
    "fade", "pop", "scale", "spring", "bounce", "elastic", "stamp", "tilt", "zoom-blur",
    "flip-x", "flip-y", "spin", "squash", "stretch", "slide-left", "slide-right", "slide-up", "slide-down",
    "blur-in", "wipe-left", "wipe-right", "wipe-up", "wipe-down",
  ] as const) {
    const elements = render(`enter-${kind}`, { "cue-enter": kind, "cue-enter-frames": 6 });
    assert.ok(elements.find((element) => element.id === "cue-motion")?.animation, `${kind} emitted no Cue animation`);
  }
  for (const kind of ["shake", "wobble", "glow-pulse", "breathe", "float", "pulse", "flicker"] as const) {
    const elements = render(`loop-${kind}`, { loop: kind, "loop-target": "cue", "loop-period-frames": 8 });
    assert.ok(elements.find((element) => element.id === "cue-loop")?.animation, `${kind} emitted no loop animation`);
  }
  for (const kind of ["scale", "pop", "spring"] as const) {
    const elements = render(`response-${kind}`, {
      "active-response": kind, "active-response-frames": 5, "active-scale": 1.12,
    });
    assert.ok(elements.find((element) => element.id === "atom-1-response")?.animation,
      `${kind} emitted no active response`);
  }
  const exiting = render("atom-exit", { "atom-exit": "wipe-left", "atom-exit-frames": 4 });
  assert.ok(exiting.find((element) => element.id === "atom-1-entry")?.animation,
    "Atom exit emitted no lifecycle animation");
});
