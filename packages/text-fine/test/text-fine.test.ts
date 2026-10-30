import { blobManifest } from "@hypit/blob";
import { sealTimeline, timelineDependency, timelineManifest, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { narrativeProjectionFixture, timelineFixture } from "../../../test/timeline-fixture.js";
import { projectProgramWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";

import { registerTypeRefinements } from "@hypit/refinement";
import { compositionManifest, compositionTypes, sealComposition, visualElements } from "@hypit/composition";
import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
} from "@hypit/kernel";
import { AuthorFrontendRegistry, resolveCompiledSourceExport } from "@hypit/author";
import { compileSourceClosure } from "@hypit/compiler";
import { compileHtmlProgram } from "@hypit/html-program";
import { mediaDependency, mediaManifest, mediaTypes } from "@hypit/media";
import type { CompositableSurfaceRef, FontArtifactRef } from "@hypit/media";
import type { NarrativeSelectionRef } from "@hypit/narrative";
import type { ModuleManifest } from "@hypit/protocol";
import { bindAreaTextPlacement, bindPathTextPlacement, createFineTextOccurrence, renderFineTextOccurrence, renderFineTextMask, sealTextItemSpec, sealTextStyle, stillTextMotion, sealTextMotion, sealTextPathMotion, sealTextMaskSpec, textFineManifest, textFineModuleRef, textFineProducers, textFineTypes } from "@hypit/text-fine";
import type { TextStyle } from "@hypit/text-fine";
import { spatialComponent, spatialDependency, spatialManifest, spatialTypes } from "@hypit/spatial";

function buildState(
  program: Parameters<typeof planBuild>[0],
  graph: Parameters<typeof planBuild>[1],
  targets: readonly string[],
) {
  const planned = planBuild(program, graph, targets);
  return materializeBuild(defineBuild({
    program,
    plan: planned.plan,
  }), []);
}
import { recipeManifest, recipeType } from "@hypit/recipe";
import { sealText, textComponent, textDependency, textManifest, textTypes } from "@hypit/text";
import { refineRecord, RefinementRegistry } from "@hypit/refinement";
import { resolveSelfDescribedTextSource } from "@hypit/source/text";
import { temporalDependency, temporalManifest, temporalTypes } from "@hypit/temporal";

const space = sealTimeline({ id: "test-space", frameCount: 150, frameRate: { numerator: 30, denominator: 1 },
});
const semanticOptions = { narrativeId: "script", segments: [{ id: "line", frameCount: 150 }], anchors: [
  { identity: "selection:start", frame: 30 },
  { identity: "selection:end", frame: 60 },
] } as const;
const semantic = timelineFixture(space, semanticOptions);
const narrativeProjection = narrativeProjectionFixture(semantic, semanticOptions);

const exactTestFont: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob",
    resource: fixtureResource("text-fine-test-font"),
    size: 1,
    mediaType: "font/woff2",
  } }],
  weight: 700,
  style: "normal",
};

const exactTestSurface: CompositableSurfaceRef = {
  artifact: {
    kind: "blob",
    resource: fixtureResource("text-fine-test-surface"),
    size: 1,
    mediaType: "image/png",
  },
  width: 920,
  height: 520,
  picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const,
  timing: { kind: "still" },
};

function textStyle(id: string): TextStyle {
  return sealTextStyle({

    id,
    typography: {
      fonts: [exactTestFont],
      sizePx: 48,
      weight: 700,
      style: "normal",
      axes: [],
      features: [],
      synthesis: "none",
      kerning: "auto",
      trackingPx: 0,
      wordSpacingPx: 0,
      lineHeight: 1.2,
      direction: "auto",
      writingMode: "horizontal-tb",
      baselineShiftPx: 0,
      tabSize: 4,
      indentationPx: 0,
      paragraphBeforePx: 0,
      paragraphAfterPx: 0,
      transform: "none",
      variantCaps: "normal",
      verticalAlign: "baseline",
      decorations: [],
      cjk: { textSpacing: "normal", punctuationTrim: "none" },
    },
    paints: [
      { kind: "fill", paint: { kind: "solid", color: "#ffffff" } },
      {
        kind: "box",
        target: "content",
        continuity: "isolated",
        decoration: {
          fill: { kind: "solid", color: "#111111" },
          paddingPx: { top: 8, right: 12, bottom: 8, left: 12 },
          radiiPx: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 },
          shadows: [],
        },
      },
    ],
  });
}

const flowPolicy = (overrides: Partial<import("@hypit/text-fine").TextAreaFlow> = {}) => ({
  flow: {
    inlineSize: "fixed" as const, blockSize: "fixed" as const,
    paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
    inlineAlign: "center" as const, blockAlign: "center" as const, wrap: "word" as const,
    overflow: "visible" as const, clipToFrame: false, columns: 1, columnGapPx: 0,
    metricEdge: "line-box" as const,
    ...overrides,
  },
});

const pathPolicy = () => ({
  side: "left" as const, orientation: "follow" as const,
  startMarginPx: 0, endMarginPx: 0, align: "start" as const,
  reverse: false, overflow: "visible" as const,
});

function document(text: string) {
  return { paragraphs: [{ id: "paragraph", inlines: [{ kind: "text" as const, id: "run", text }] }] };
}

function absoluteWindow(subjectId: string, startFrame: number, endFrameExclusive: number) {
  return {
    id: `${subjectId}-window`, subjectId,
    start: { id: `${subjectId}-window.start`, subjectId, timelineId: space.id, frame: startFrame },
    end: { id: `${subjectId}-window.end`, subjectId, timelineId: space.id, frame: endFrameExclusive },
    span: { startFrame, endFrameExclusive },
  };
}

test("one fine Text occurrence renders without an aggregate Typography program", () => {
  const occurrence = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 80, yPx: 220, widthPx: 920, heightPx: 520 }, flowPolicy()),
    sealTextItemSpec({ id: "standalone", document: document("One truthful occurrence") }),
    textStyle("standalone-style"),
    stillTextMotion("standalone-motion"),
    absoluteWindow("standalone", 30, 90),
  );
  assert.equal(occurrence.timelineId, space.id);
  assert.deepEqual(occurrence.span, { startFrame: 30, endFrameExclusive: 90 });
  const visual = renderFineTextOccurrence(space, occurrence);
  assert.equal(visual.id, "standalone");
  assert.equal(visual.items.length, 1);
  assert.ok(visual.items[0] !== undefined);
  assert.equal(visualElements(visual.items[0]!.root).at(-1)?.kind, "text-flow");
});

test("Text Mask explicitly consumes one fine Text occurrence and one owned still Surface", () => {
  const baseStyle = textStyle("mask-style");
  const occurrence = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 100, yPx: 200, widthPx: 800, heightPx: 240 }, flowPolicy({ wrap: "none" })),
    sealTextItemSpec({ id: "mask-title", document: document("OWNED MASK") }),
    baseStyle,
    stillTextMotion(),
    absoluteWindow("mask-title", 0, 150),
  );
  const material: CompositableSurfaceRef = {
    artifact: { kind: "blob", resource: fixtureResource("text-mask-material"), size: 1, mediaType: "image/png" },
    width: 400, height: 240, picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const, timing: { kind: "still" },
  };
  const track = renderFineTextMask(space, occurrence, material, sealTextMaskSpec({
    id: "masked-title", mode: "alpha", materialFit: "cover",
  }));
  assert.equal(track.id, "masked-title");
  assert.ok(track.items[0] !== undefined);
  const elements = visualElements(track.items[0]!.root);
  assert.deepEqual(elements.filter((element) => element.kind !== "program").map((element) => element.kind),
    ["mask", "text", "surface"]);
  const html = compileHtmlProgram(sealComposition({ id: "owned-mask-composition", visual: { canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space)).html;
  assert.match(html, /<foreignObject/u);
  assert.match(html, />OWNED MASK</u);
  assert.match(html, /mask-type:alpha/u);
  assert.match(html, /matrix\(2,0,0,2,0,-120\)/u);
  assert.throws(() => renderFineTextMask(space, occurrence, {
    ...material, artifact: { ...material.artifact, mediaType: "video/webm" },
    timing: { kind: "frames", frameCount: 150, frameRate: { numerator: 30, denominator: 1 } },
  }, sealTextMaskSpec({
    id: "timed-mask", mode: "alpha", materialFit: "cover",
  })), /requires one explicit still material Surface/u);
  assert.throws(() => renderFineTextMask(space, {
    ...occurrence,
    placement: occurrence.placement.kind === "flow"
      ? { ...occurrence.placement, flow: { ...occurrence.placement.flow, overflow: "shrink", minimumScale: 0.7 } }
      : occurrence.placement,
  }, material, sealTextMaskSpec({
    id: "advanced-mask", mode: "alpha", materialFit: "cover",
  })), /must be materialized by an independent package/u);
});

test("FineTextOccurrence rejects a frame span outside Timeline", () => {
  assert.throws(() => createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 0, yPx: 0, widthPx: 1080, heightPx: 192 }, flowPolicy()),
    sealTextItemSpec({ id: "late", document: document("Too late") }),
    textStyle("late"), stillTextMotion(), absoluteWindow("late", 149, 151),
  ), /outside/u);
});

test("Selection Text consumes explicit Selection, Timeline, Style, Motion and Placement edges", () => {
  const selection: NarrativeSelectionRef = {
    narrativeId: "script",
    id: "callout",
    startAnchorId: "selection:start",
    endAnchorId: "selection:end",
  };
  const spec = sealTextItemSpec({

    id: "meaning",
    document: document("MEANING"),
  });
  const occurrence = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 108, yPx: 192, widthPx: 864, heightPx: 192 }, flowPolicy()),
    spec,
    textStyle("meaning"),
    stillTextMotion(),
    projectSelectionWindow({
      itemId: spec.id,
      semantic,
      narrative: narrativeProjection,
      selection,
      projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
    }),
  );
  assert.deepEqual(occurrence.span, { startFrame: 30, endFrameExclusive: 60 });
});

test("rich Text lowers ordered glyph layers, boxes, bounded flow, sequences and Path Text", () => {
  const base = textStyle("rich");
  const rich = sealTextStyle({
    ...base,
    typography: {
      ...base.typography,
      language: "en",
      trackingPx: 1.5,
      decorations: [{
        line: "underline", paint: { kind: "solid", color: "#facc15" },
        style: "wavy", thicknessPx: 2, offsetPx: 4, skipInk: true,
      }],
    },
    paints: [
      { kind: "shadow", paint: { kind: "solid", color: "#2563eb" }, offsetX: 7, offsetY: 6, blurPx: 3, spreadPx: 1 },
      { kind: "stroke", paint: { kind: "solid", color: "#ef4444" }, widthPx: 5, placement: "outside" },
      { kind: "fill", paint: { kind: "linear-gradient", angleDeg: 30, stops: [
        { offset: 0, color: "#ffffff", opacity: 1 },
        { offset: 1, color: "#a7f3d0", opacity: 1 },
      ] } },
      { kind: "stroke", paint: { kind: "solid", color: "#fde047" }, widthPx: 2, placement: "inside" },
      { kind: "shadow", paint: { kind: "solid", color: "#16a34a" }, offsetX: -4, offsetY: 3, blurPx: 0, spreadPx: 0 },
      { kind: "glow", paint: { kind: "solid", color: "#e879f9" }, blurPx: 8, spreadPx: 2 },
      {
        kind: "box", target: "line", continuity: "isolated",
        decoration: {
          fill: { kind: "radial-gradient", center: { x: 0.5, y: 0.5 }, stops: [
            { offset: 0, color: "#172554", opacity: 0.9 },
            { offset: 1, color: "#020617", opacity: 0.9 },
          ] },
          paddingPx: { top: 4, right: 8, bottom: 4, left: 8 },
          radiiPx: { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 },
          shadows: [],
        },
      },
      {
        kind: "box", target: "word", continuity: "isolated",
        decoration: {
          paddingPx: { top: 1, right: 2, bottom: 1, left: 2 },
          radiiPx: { topLeft: 2, topRight: 2, bottomRight: 2, bottomLeft: 2 },
          shadows: [],
        },
      },
    ],
  });
  const pathStyle = sealTextStyle({
    ...base,
    id: "path",
    paints: [{ kind: "fill", paint: { kind: "radial-gradient", center: { x: 0.5, y: 0.5 }, stops: [
      { offset: 0, color: "#ffffff", opacity: 1 },
      { offset: 1, color: "#38bdf8", opacity: 1 },
    ] } }],
  });
  const motion = sealTextMotion({

    id: "sequenced",
    item: { keyframes: [
      { atFrame: 0, style: [{ name: "opacity", value: 0 }, { name: "transform", value: "translateY(20px)" }] },
      { atFrame: 10, easing: "ease-out", style: [{ name: "opacity", value: 1 }, { name: "transform", value: "translateY(0px)" }] },
    ] },
    sequences: [
      {
        id: "words", unit: "word", range: { start: 0, endExclusive: 3 }, order: "reverse",
        startFrame: 0, unitDurationFrames: 20, staggerFrames: 4, cycles: 1,
        keyframes: [
          { atProgress: 0, state: { opacity: 0, transform: { translateXPx: 0, translateYPx: 0, scale: 0.7, rotateDeg: 0, skewXDeg: 0, skewYDeg: 0 } } },
          { atProgress: 1, easing: "ease-out", state: { opacity: 1, transform: { translateXPx: 0, translateYPx: 0, scale: 1, rotateDeg: 0, skewXDeg: 0, skewYDeg: 0 } } },
        ],
      },
      {
        id: "lines", unit: "line", range: { start: 0, endExclusive: 2 }, order: "forward",
        startFrame: 20, unitDurationFrames: 15, staggerFrames: 5, cycles: 1,
        keyframes: [
          { atProgress: 0, state: { opacity: 0 } },
          { atProgress: 1, state: { opacity: 1 } },
        ],
      },
    ],
  });
  const pathMotion = sealTextPathMotion({
    id: "path-motion",
    keyframes: [{ atFrame: 0, startMarginPx: 0 }, { atFrame: 180, startMarginPx: 120, easing: "ease-in-out" }],
  });
  const area = createFineTextOccurrence(
    space,
    bindAreaTextPlacement({ xPx: 80, yPx: 200, widthPx: 720, heightPx: 320 }, flowPolicy({ overflow: "shrink", maxLines: 3, minimumScale: 0.6 })),
    sealTextItemSpec({
      id: "area",
      document: { paragraphs: [{
          id: "p1",
          inlines: [
            { kind: "text", id: "latin", text: "Intent stays " },
            { kind: "text", id: "cjk", text: "可见", language: "zh-Hans", style: { typography: { weight: 400 } } },
            { kind: "break", id: "break" },
            { kind: "text", id: "rtl", text: "مرحبا 👩🏽‍💻 e\u0301", language: "ar", direction: "rtl" },
          ],
        }] },
    }),
    rich, motion, absoluteWindow("area", 0, 150),
  );
  const path = createFineTextOccurrence(
    space,
    bindPathTextPlacement({ commands: [
      { kind: "move", xPx: 100, yPx: 700 },
      { kind: "quadratic", controlX: 540, controlY: 520, xPx: 980, yPx: 700 },
    ] }, pathPolicy(), pathMotion),
    sealTextItemSpec({ id: "path", document: document("Renderer-neutral Path Text") }),
    pathStyle, stillTextMotion("path-still"), absoluteWindow("path", 0, 150),
  );
  const rendered = compileHtmlProgram(sealComposition({ id: "rich-text-film", visual: { canvas: { width: 1080, height: 900, clearColor: "#000000" }, root: { members: [renderFineTextOccurrence(space, area), renderFineTextOccurrence(space, path)]
      .map((track, z) => ({ kind: "track" as const, id: track.id, z, track })) } }, audio: { contributions: [] } }, space));
  assert.match(rendered.html, /data-hypit-text-paint-layer="5"/u);
  assert.match(rendered.html, /feMorphology/u);
  assert.match(rendered.html, /linear-gradient\(30deg/u);
  assert.match(rendered.html, /radial-gradient/u);
  assert.match(rendered.html, /data-hypit-text-overflow="shrink"/u);
  assert.match(rendered.html, /data-hypit-text-line-sequences/u);
  assert.match(rendered.html, /<textPath/u);
  assert.match(rendered.html, /data-hypit-text-path-margin/u);
});
