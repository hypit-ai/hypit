import { sealTimeline, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { timelineFixture } from "../../../test/timeline-fixture.js";

import { blobTypes } from "@hypit/blob";
import { compositionTypes, visualElements } from "@hypit/composition";
import type { VisualElement } from "@hypit/composition";
import { appendDepthStackCard, createDepthStackCardSet, decodeDepthStackSpec, depthStackProducers, depthStackTypes, finalizeDepthStack, noDepthStackCardLabel, renderDepthStack, resolveDepthStackPose, resolveDepthStackState, sealDepthStackCardLabel, sealDepthStackCardSpec, sealDepthStackHeader, sealDepthStackSpec } from "@hypit/depth-stack";
import type {
  DepthStackCardLabel,
  DepthStackProgram,
  DepthStackSpec,
} from "@hypit/depth-stack";
import type { FontArtifactRef } from "@hypit/media";
import { mediaTypes, preparedVisualExtent, prepareMedia } from "@hypit/media";
import type { MediaLayerSet } from "@hypit/visual-track";
import { defaultTemporalRelationSpec, isAffineTemporalMapPiece, temporalTypes, temporalValueInFrames } from "@hypit/temporal";
import type { TemporalInstant, TemporalMap } from "@hypit/temporal";
import { canvasFrame, sealCanvas, sealSpatialFrame, spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/recipe";
import { sealText, textTypes } from "@hypit/text";
import type { Recipe } from "@hypit/recipe";
import { visualTrackTypes } from "@hypit/visual-track";
import { poseAnimation } from "../src/lower.js";

const space = sealTimeline({ id: "test-space", frameCount: 60, frameRate: { numerator: 30, denominator: 1 },
});
const semantic = timelineFixture(space);
const canvas = sealCanvas({
  widthPx: 360,
  heightPx: 640,
});
const within = canvasFrame(canvas);
const frame = sealSpatialFrame({
  xPx: 60,
  yPx: 220,
  widthPx: 240,
  heightPx: 180,
});

const image = (name: string) => ({
  kind: "blob" as const,
  resource: fixtureResource(`deck-image:${name}`),
  size: 16,
  mediaType: "image/png",
});
const video = (name: string) => ({
  kind: "blob" as const,
  resource: fixtureResource(`deck-video:${name}`),
  size: 32,
  mediaType: "video/mp4",
});

function stillMaterial(name: string): MediaLayerSet {
  return {

    layers: [{
      id: `${name}:sample`,
      kind: "sample",
      source: {
        kind: "still",
        artifact: image(name),
        picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full",
          bitDepth: 8, alphaMode: "straight" },
        extent: { widthPx: 120, heightPx: 90 },
      },
      placement: { kind: "fit", fit: {
        sizing: "cover",
        framePoint: { x: 0.5, y: 0.5 },
        contentPoint: { x: 0.5, y: 0.5 },
        offsetPx: { x: 0, y: 0 },
        constraint: "bounded",
      } },
      appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
    }],
  };
}

function timedMaterial(
  name: string,
  frameRate = { numerator: 30, denominator: 1 },
  frameCount = 12,
): MediaLayerSet {
  const prepared = prepareMedia({
    id: `prepared-${name}`,
    source: video(name),
    inspection: { container: { formatNames: ["mp4"] }, streams: [{
      kind: "video" as const, index: 0, codecType: "video" as const, codecName: "h264", role: "moving" as const,
      disposition: { default: true, attachedPicture: false }, timingStatus: "admissible" as const,
      timeBase: { numerator: frameRate.denominator, denominator: frameRate.numerator },
      startPts: { ticks: "0", timeBase: { numerator: frameRate.denominator, denominator: frameRate.numerator } },
      endPts: { ticks: String(frameCount), timeBase: { numerator: frameRate.denominator, denominator: frameRate.numerator } },
      decodedUnitCount: frameCount, width: 120, height: 90,
      sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,
      averageFrameRate: frameRate, nominalFrameRate: frameRate,
    }] },
    selection: { videoStreamIndex: 0, spanAuthority: "video", picture: {
      colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited",
      bitDepth: 8, alphaMode: "opaque",
    } },
  });
  return {

    layers: [{
      id: `${name}:sample`,
      kind: "sample",
      source: {
        kind: "timed",
        media: prepared,
        extent: preparedVisualExtent(prepared),
      },
      placement: { kind: "fit", fit: {
        sizing: "contain",
        framePoint: { x: 0.5, y: 0.5 },
        contentPoint: { x: 0.5, y: 0.5 },
        offsetPx: { x: 0, y: 0 },
        constraint: "bounded",
      } },
      sampling: { kind: "relation", value: defaultTemporalRelationSpec() },
      appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
    }],
  };
}

function baseSpec(input: Partial<DepthStackSpec> = {}): DepthStackSpec {
  return sealDepthStackSpec({

    visibility: { previous: 2, next: 1, wrap: false },
    poses: {
      current: {
        xPx: 0, yPx: 0, scale: 1, rotationDeg: 0, opacity: 1, stacking: 0,
        tone: { brightness: 1, contrast: 1, saturation: 1 },
      },
      previous: {
        xPerDepthPx: -8, yPerDepthPx: 18, scalePerDepth: 0.9, rotationPerDepthDeg: -4,
        rotationMode: "alternate", opacityPerDepth: 0.8, stackingPerDepth: -1,
        tonePerDepth: { brightness: 0.9, contrast: 1, saturation: 0.8 },
      },
      next: {
        xPerDepthPx: 8, yPerDepthPx: -14, scalePerDepth: 0.92, rotationPerDepthDeg: 3,
        rotationMode: "alternate", opacityPerDepth: 0.7, stackingPerDepth: -1,
        tonePerDepth: { brightness: 0.85, contrast: 1, saturation: 0.75 },
      },
    },
    reflow: { durationFrames: 4, easing: "ease-in-out" },
    treatment: {
      clip: { kind: "rounded", radiusPx: 18 },
      padding: { topPx: 8, rightPx: 8, bottomPx: 8, leftPx: 8 },
      border: { widthPx: 2, style: "solid", color: "#ffffff" },
      shadows: [{ offsetX: 0, offsetY: 6, blurPx: 14, spreadPx: 0, color: "#00000088" }],
    },
    ...input,
  });
}

function cardSpec(id: string, past: "hold-tail" | "continue" | "hide" = "hold-tail", future: "hold-head" | "continue" = "hold-head") {
  return sealDepthStackCardSpec({

    id,
    playback: { future, past },
  });
}

function momentPoint(id: string, frameValue: number): TemporalInstant {
  return {
    id: `${id}.moment`,
    subjectId: id,
    timelineId: space.id,
    frame: frameValue,
  };
}

function programPoint(subjectId: string, endFrame: number): TemporalInstant {
  return {
    id: "timeline.end",
    subjectId,
    timelineId: space.id,
    frame: endFrame,
  };
}

function program(input: {
  readonly spec?: DepthStackSpec;
  readonly materials?: readonly MediaLayerSet[];
  readonly labels?: readonly DepthStackCardLabel[];
  readonly playbacks?: readonly ReturnType<typeof cardSpec>[];
  readonly triggers?: readonly number[];
  readonly terminal?: number;
} = {}): DepthStackProgram {
  const triggers = input.triggers ?? [0, 20, 40];
  let set = createDepthStackCardSet();
  for (const [index, trigger] of triggers.entries()) {
    const id = `card-${index + 1}`;
    set = appendDepthStackCard(
      set,
      space,
      input.materials?.[index] ?? stillMaterial(id),
      input.labels?.[index] ?? noDepthStackCardLabel(),
      input.playbacks?.[index] ?? cardSpec(id),
      momentPoint(id, trigger),
    );
  }
  return finalizeDepthStack(
    set,
    sealDepthStackHeader({ id: "proof-stack" }),
    frame,
    input.spec ?? baseSpec(),
    programPoint("proof-stack", input.terminal ?? 60),
    space,
  );
}

function element(track: ReturnType<typeof renderDepthStack>, presentId: string, predicate: (value: VisualElement) => boolean): VisualElement {
  const present = track.items.find((candidate) => candidate.id === presentId);
  const value = present === undefined ? undefined : visualElements(present.root).find(predicate);
  assert(value !== undefined, `${presentId} element is missing`);
  return value;
}

function mapFrames(map: TemporalMap) {
  return map.stages[0]!.pieces.map((piece) => {
    assert.ok(isAffineTemporalMapPiece(piece));
    const position = (value: typeof piece.sourceAtStart) => {
      const result = temporalValueInFrames(value, { frameRate: { numerator: 30, denominator: 1 } });
      return { numerator: Number(result.numerator), denominator: Number(result.denominator) };
    };
    return {
      target: {
        startFrame: position(piece.target.start).numerator,
        endFrameExclusive: position(piece.target.end).numerator,
      },
      sourceAtStart: position(piece.sourceAtStart),
      rate: piece.rate,
      ...(piece.wrap === undefined ? {} : { wrap: {
        startFrame: position(piece.wrap.start).numerator,
        endFrameExclusive: position(piece.wrap.end).numerator,
      } }),
    };
  });
}

test("finite DepthStack state resolves previous-only, next-only, mixed and zero-neighbor boundaries", () => {
  const value = program({ triggers: [0, 10, 20, 30, 40], terminal: 60 });
  assert.deepEqual([...resolveDepthStackState(value, 0)], [[0, 0], [1, 1]]);
  assert.deepEqual([...resolveDepthStackState(value, 2)], [[2, 0], [1, -1], [0, -2], [3, 1]]);
  assert.deepEqual([...resolveDepthStackState(value, 4)], [[4, 0], [3, -1], [2, -2]]);
  const zero = program({ spec: baseSpec({ visibility: { previous: 0, next: 0, wrap: false } }) });
  assert.deepEqual([...resolveDepthStackState(zero, 1)], [[1, 0]]);
});

test("explicit wrapping never aliases one Card into several relative depths", () => {
  const wrapped = program({
    spec: baseSpec({ visibility: { previous: 1, next: 1, wrap: true } }),
    triggers: [0, 15, 30, 45],
  });
  assert.deepEqual([...resolveDepthStackState(wrapped, 0)], [[0, 0], [3, -1], [1, 1]]);
  assert.throws(() => program({
    spec: baseSpec({ visibility: { previous: 2, next: 2, wrap: true } }),
    triggers: [0, 20, 40],
  }), /several relative depths/u);
});

test("missing, equal, reversed and terminal-crossing triggers fail in authored order", () => {
  assert.throws(() => finalizeDepthStack(
    createDepthStackCardSet(), sealDepthStackHeader({ id: "empty" }),
    frame, baseSpec(), programPoint("empty", 60), space,
  ), /at least one Card/u);
  assert.throws(() => program({ triggers: [0, 20, 20] }), /strictly increasing/u);
  assert.throws(() => program({ triggers: [0, 30, 20] }), /strictly increasing/u);
  assert.throws(() => program({ triggers: [0, 20, 60] }), /terminal must be after/u);
});

test("relative-depth pose resolves offsets, multiplicative tone and alternating rotation", () => {
  const spec = baseSpec();
  assert.deepEqual(resolveDepthStackPose(spec, -1), {
    xPx: -8, yPx: 18, scale: 0.9, rotationDeg: -4, opacity: 0.8, stacking: -1,
    tone: { brightness: 0.9, contrast: 1, saturation: 0.8 },
  });
  assert.deepEqual(resolveDepthStackPose(spec, -2), {
    xPx: -16, yPx: 36, scale: 0.81, rotationDeg: 4, opacity: 0.64, stacking: -2,
    tone: { brightness: 0.81, contrast: 1, saturation: 0.64 },
  });
});

test("collection reflow moves the complete old/new union while cut replaces it exactly", () => {
  const animatedProgram = program();
  const animated = renderDepthStack(space, animatedProgram);
  const stageTwo = animated.items.filter((present) => present.span.startFrame === 20);
  assert.deepEqual(stageTwo.map((present) => present.id).sort(), [
    "card-1:stage:2", "card-2:stage:2", "card-3:stage:2",
  ]);
  assert.deepEqual(poseAnimation({
    program: animatedProgram,
    stageDuration: 20,
    oldDepth: 0,
    newDepth: -1,
  })?.keyframes.map((value) => value.atFrame), [0, 4, 20]);
  const cutProgram = program({ spec: baseSpec({ reflow: { durationFrames: 0, easing: "linear" } }) });
  const cut = renderDepthStack(space, cutProgram);
  assert.equal(cut.items.filter((present) => present.span.startFrame === 20).length, 3);
  assert.equal(poseAnimation({ program: cutProgram, stageDuration: 20, oldDepth: 0, newDepth: -1 }), undefined);
});

test("timed Cards hold future head/current clock/past tail without renderer playback history", () => {
  const value = program({
    materials: [stillMaterial("one"), timedMaterial("two"), stillMaterial("three")],
  });
  const track = renderDepthStack(space, value);
  const future = element(track, "card-2:stage:1", (value) => value.kind === "video");
  const current = element(track, "card-2:stage:2", (value) => value.kind === "video");
  const past = element(track, "card-2:stage:3", (value) => value.kind === "video");
  assert.equal(future.kind, "video");
  assert.equal(current.kind, "video");
  assert.equal(past.kind, "video");
  assert.equal(mapFrames(future.sampling)[0]?.rate.numerator, 0);
  assert.deepEqual(mapFrames(current.sampling)[0]?.target,
    { startFrame: 0, endFrameExclusive: 12 });
  assert.equal(mapFrames(current.sampling)[0]?.wrap, undefined);
  assert.equal(mapFrames(past.sampling)[0]?.sourceAtStart.numerator, 12,
    "the exact source end boundary is retained; terminal sampling owns its left-limit frame");
  assert.equal(mapFrames(past.sampling)[0]?.rate.numerator, 0);
});

test("continue derives one explicit periodic clock and past hide removes the retained state", () => {
  const continued = renderDepthStack(space, program({
    materials: [timedMaterial("one"), timedMaterial("two"), stillMaterial("three")],
    playbacks: [cardSpec("card-1", "continue"), cardSpec("card-2", "hold-tail", "continue"), cardSpec("card-3")],
  }));
  const future = element(continued, "card-2:stage:1", (value) => value.kind === "video");
  const past = element(continued, "card-1:stage:2", (value) => value.kind === "video");
  assert.equal(future.kind, "video");
  assert.equal(past.kind, "video");
  assert.deepEqual(mapFrames(future.sampling)[0]?.wrap, { startFrame: 0, endFrameExclusive: 12 });
  assert.deepEqual(mapFrames(past.sampling)[0]?.wrap, { startFrame: 0, endFrameExclusive: 12 });
  const derived = renderDepthStack(space, program({
    materials: [timedMaterial("one"), stillMaterial("two"), stillMaterial("three")],
    playbacks: [cardSpec("card-1", "continue"), cardSpec("card-2"), cardSpec("card-3")],
  }));
  const derivedPast = element(derived, "card-1:stage:2", (value) => value.kind === "video");
  assert.deepEqual(derivedPast.kind === "video" ? mapFrames(derivedPast.sampling)[0]?.wrap : undefined,
    { startFrame: 0, endFrameExclusive: 12 });
  const hidden = program({ playbacks: [cardSpec("card-1", "hide"), cardSpec("card-2"), cardSpec("card-3")] });
  assert.equal(resolveDepthStackState(hidden, 1).has(0), false);
});

test("continue advances by exact programme time across a different source frame rate", () => {
  const continued = renderDepthStack(space, program({
    materials: [timedMaterial("one-24", { numerator: 24, denominator: 1 }, 12), stillMaterial("two"), stillMaterial("three")],
    playbacks: [cardSpec("card-1", "continue"), cardSpec("card-2"), cardSpec("card-3")],
  }));
  const past = element(continued, "card-1:stage:2", (value) => value.kind === "video");
  assert.equal(past.kind, "video");
  const piece = past.kind === "video" ? past.sampling.stages[0]?.pieces[0] : undefined;
  assert.ok(piece !== undefined);
  const phase = temporalValueInFrames(piece.sourceAtStart, { frameRate: { numerator: 24, denominator: 1 } });
  assert.deepEqual({ numerator: Number(phase.numerator), denominator: Number(phase.denominator) },
    { numerator: 4, denominator: 1 });
});

const font: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", resource: fixtureResource("deck-font"), size: 64, mediaType: "font/woff2" } }],
  weight: 700,
  style: "normal",
};

function exactLabel(): DepthStackCardLabel {
  return sealDepthStackCardLabel({

    kind: "text",
    document: { paragraphs: [{ id: "p", inlines: [{ id: "t", kind: "text", text: "Proof" }] }] },
    typography: {
      fonts: [font], sizePx: 24, weight: 700, style: "normal", axes: [], features: [], synthesis: "none",
      kerning: "normal", trackingPx: 0, wordSpacingPx: 0, lineHeight: 1.2, direction: "auto",
      writingMode: "horizontal-tb", baselineShiftPx: 0, tabSize: 4, indentationPx: 0,
      paragraphBeforePx: 0, paragraphAfterPx: 0, transform: "none", variantCaps: "normal",
      verticalAlign: "baseline", decorations: [], cjk: { textSpacing: "normal", punctuationTrim: "none" },
    },
    paints: [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }],
    flow: {
      form: { kind: "area" }, inlineSize: "fixed", blockSize: "fixed",
      paddingPx: { inlineStart: 8, inlineEnd: 8, blockStart: 8, blockEnd: 8 },
      inlineAlign: "center", blockAlign: "end", wrap: "word", overflow: "clip",
      clipToFrame: true, columns: 1, columnGapPx: 0, metricEdge: "line-box",
    },
  });
}

test("optional labels preserve exact fonts and remain inside the Card-owned pose", () => {
  const track = renderDepthStack(space, program({ labels: [exactLabel(), noDepthStackCardLabel(), noDepthStackCardLabel()] }));
  const label = element(track, "card-1:stage:1", (value) => value.kind === "text-flow");
  assert.equal(label.kind, "text-flow");
  const present = track.items.find((candidate) => candidate.id === "card-1:stage:1");
  assert.equal(present?.kind, "present");
  assert.equal(present?.root.kind, "program");
  assert.equal(label.typography.fonts?.[0]?.sources[0]?.artifact.resource, font.sources[0]!.artifact.resource);
  const authored = exactLabel();
  assert.equal(authored.kind, "text");
  assert.throws(() => sealDepthStackCardLabel({
    ...authored,
    typography: { ...authored.typography, fonts: undefined },
  } as unknown as DepthStackCardLabel), /exact font/u);
});

test("rendering is a pure absolute-frame result", () => {
  const value = program({ labels: [exactLabel(), noDepthStackCardLabel(), noDepthStackCardLabel()] });
  assert.deepEqual(renderDepthStack(space, value), renderDepthStack(space, structuredClone(value)));
});

test("SVS decoding exposes documented depth, frame treatment and playback axes", () => {
  const value = decodeDepthStackSpec({

    path: "recipes.deck.proof",
    properties: {
      "visible-previous": 3, "visible-next": 2, wrap: false,
      "previous-y-step": 24, "previous-scale-step": 0.93, "previous-rotation-mode": "alternate",
      "next-y-step": -18, "next-opacity-step": 0.7, "reflow-frames": 6, "reflow-easing": "ease-out",
      clip: "rounded", radius: 16, padding: "8 12", "border-width": 2, "border-color": "#ffffff",
    },
  });
  assert.deepEqual(value.visibility, { previous: 3, next: 2, wrap: false });
  assert.equal(value.poses.previous.yPerDepthPx, 24);
  assert.equal(value.reflow.durationFrames, 6);
  assert.equal(value.treatment.clip.kind, "rounded");
});
