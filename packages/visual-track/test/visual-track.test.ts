import { sealTimeline, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { narrativeProjectionFixture, timelineFixture } from "../../../test/timeline-fixture.js";
import { projectMomentWindow, projectProgramWindow, projectSegmentWindow, projectSelectionWindow } from "../../../test/temporal-fixture.js";
import type { TemporalWindowProjection } from "../../../test/temporal-fixture.js";

import { sealComposition, visualElements } from "@hypit/composition";
import type { VisualItem } from "@hypit/composition";
import { compileHtmlProgram } from "@hypit/html-program";
import type { HtmlElement } from "@hypit/html-program";
import { mediaTypes, prepareMedia, SRGB_STRAIGHT_PICTURE } from "@hypit/media";
import type { CompositableSurfaceRef, PreparedMedia } from "@hypit/media";
import { blobTypes } from "@hypit/blob";
import { defaultTemporalRelationSpec, evaluateTemporalMap, exactTemporalValueFromFrames, isAffineTemporalMapPiece, resolveTemporalRelation, temporalTypes,
  temporalValueInFrames } from "@hypit/temporal";
import { appendMediaPaintLayer, appendMappedStillMediaLayer, appendVisualClip, appendVisualTransition, assertVisualTrackSet, appendStillMediaLayer, appendSurfaceMediaLayer, appendTimedMediaLayer, bindVisualClipPath, createMediaLayerSet, createVisualTrackSet, decodeMediaFramePaint, finalizeVisualTrack, projectVisualTrack, poseAnimation, sealVisualClipSpec, sealMediaPaintLayerSpec, sealMediaSampleLayerSpec, sealVisualTrackHeader, stillVisualTrackFragment, visualTrackManifest, visualTrackTypes, visualTransitionSpan } from "@hypit/visual-track";
import { crossDissolveEffect } from "@hypit/visual-transition";
import type { VisualClipSpec, MediaLayerSet } from "@hypit/visual-track";
import type { ExactTemporalValue, TemporalMapPiece, TemporalRelationSpec } from "@hypit/temporal";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import type { BlobRef } from "@hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/recipe";
import type { Recipe } from "@hypit/recipe";
import { lowerVisualClipElement } from "../src/lower.js";

const presentElements = (item: VisualItem) => {
  assert.equal(item.kind, "present");
  return visualElements(item.root);
};

const htmlElements = (root: HtmlElement): readonly HtmlElement[] => {
  const children = root.kind === "box"
    ? root.children
    : root.kind === "program"
      ? root.slots.map((slot) => slot.element)
      : root.kind === "mask"
        ? [root.mask, root.content]
        : [];
  return [root, ...children.flatMap(htmlElements)];
};

const loweredClipElements = (program: ReturnType<typeof finalizeVisualTrack>, index = 0) =>
  htmlElements(lowerVisualClipElement(program.clips[index]!));

test("gradient frame paints preserve commas inside functional colors", () => {
  const paint = (value: string) => decodeMediaFramePaint({ path: "scrim", properties: { "frame-paint": value } }, "scrim")?.paint;
  assert.deepEqual(paint("linear(180;rgba(0,0,0,0)@0,rgba(0,0,0,0.8)@1)"), {
    kind: "linear-gradient",
    angleDeg: 180,
    stops: [{ color: "rgba(0,0,0,0)", offset: 0 }, { color: "rgba(0,0,0,0.8)", offset: 1 }],
  });
});

const space = sealTimeline({ id: "test-space", frameCount: 120, frameRate: { numerator: 30, denominator: 1 },
});
const canvas = {
  widthPx: 1080,
  heightPx: 1920,
};
const header = sealVisualTrackHeader({ id: "proof" });
const semanticOptions = {
  narrativeId: "script",
  segments: [
    { id: "opening", frameCount: 30 },
    { id: "answer", frameCount: 60 },
    { id: "ending", frameCount: 30 },
  ],
  anchors: [
    { identity: "a", frame: 15 }, { identity: "b", frame: 45 },
    { identity: "c", frame: 60 }, { identity: "d", frame: 105 },
  ],
} as const;
const semantic = timelineFixture(space, semanticOptions);
const narrativeProjection = narrativeProjectionFixture(semantic, semanticOptions);
const source: BlobRef = {
  kind: "blob",
  resource: fixtureResource("media-track:still"),
  size: 4_096,
  mediaType: "image/png",
};
const extent = { widthPx: 800, heightPx: 800 };
const frame = { xPx: 100, yPx: 200, widthPx: 400, heightPx: 300 };
const fit = {
  sizing: "contain" as const,
  framePoint: { x: 0.5, y: 0.5 },
  contentPoint: { x: 0.5, y: 0.5 },
  offsetPx: { x: 0, y: 0 },
  constraint: "bounded" as const,
};
const appearance = {
  opacity: 1,
  filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 },
};

type NarrativeWindowProjection = Parameters<typeof projectSelectionWindow>[0]["projection"];
type TestVisualClipSpec = VisualClipSpec & { readonly projection: TemporalWindowProjection | NarrativeWindowProjection };
const defaultClipProjection: TemporalWindowProjection = {
  start: { ref: "timeline.start" }, end: { ref: "timeline.end" },
};

function clipSpec(overrides: Partial<TestVisualClipSpec> = {}): TestVisualClipSpec {
  const { projection = defaultClipProjection, ...clipOverrides } = overrides;
  return {
    ...sealVisualClipSpec({

    id: "product",
    treatment: {
      clip: { kind: "rounded", radiusPx: 20 },
      padding: { topPx: 10, rightPx: 10, bottomPx: 10, leftPx: 10 },
      border: { widthPx: 2, style: "solid", color: "#ffffff" },
      shadows: [{ offsetX: 0, offsetY: 8, blurPx: 20, spreadPx: 0, color: "#00000080" }],
    },
    ...clipOverrides,
    }),
    projection,
  };
}

function appendProgramVisualClip(
  set: ReturnType<typeof createVisualTrackSet>, trackHeader: typeof header, timeline: typeof semantic,
  layers: MediaLayerSet, frameValue: typeof frame, authored: VisualClipSpec | TestVisualClipSpec,
) {
  const projection = "projection" in authored ? authored.projection : defaultClipProjection;
  const { projection: _ignored, ...spec } = authored as TestVisualClipSpec;
  return appendVisualClip(set, trackHeader, space, layers, frameValue, spec,
    projectProgramWindow({ itemId: spec.id, semantic: timeline, projection: projection as TemporalWindowProjection }));
}

function appendSelectionVisualClip(
  set: ReturnType<typeof createVisualTrackSet>, trackHeader: typeof header, timeline: typeof semantic,
  layers: MediaLayerSet, frameValue: typeof frame, selection: NarrativeSelectionRef,
  authored: TestVisualClipSpec,
) {
  const { projection, ...spec } = authored;
  return appendVisualClip(set, trackHeader, space, layers, frameValue, spec,
    projectSelectionWindow({ itemId: spec.id, semantic: timeline, narrative: narrativeProjection, selection,
      projection: projection as NarrativeWindowProjection }));
}

function appendSegmentVisualClip(
  set: ReturnType<typeof createVisualTrackSet>, trackHeader: typeof header, timeline: typeof semantic,
  layers: MediaLayerSet, frameValue: typeof frame, segment: { narrativeId: string; kind: "segment"; id: string; tokenStart: number; tokenEndExclusive: number },
  authored: TestVisualClipSpec,
) {
  const { projection, ...spec } = authored;
  return appendVisualClip(set, trackHeader, space, layers, frameValue, spec,
    projectSegmentWindow({ itemId: spec.id, semantic: timeline, narrative: narrativeProjection, segment,
      projection: projection as NarrativeWindowProjection }));
}

function appendMomentVisualClip(
  set: ReturnType<typeof createVisualTrackSet>, trackHeader: typeof header, timeline: typeof semantic,
  layers: MediaLayerSet, frameValue: typeof frame, moment: NarrativeMomentRef,
  authored: TestVisualClipSpec,
) {
  const { projection, ...spec } = authored;
  return appendVisualClip(set, trackHeader, space, layers, frameValue, spec,
    projectMomentWindow({ itemId: spec.id, semantic: timeline, narrative: narrativeProjection, moment,
      projection: projection as NarrativeWindowProjection }));
}

function stillLayers(): MediaLayerSet {
  let layers = createMediaLayerSet();
  layers = appendMediaPaintLayer(layers, sealMediaPaintLayerSpec({

    id: "backing",
    paint: { kind: "linear-gradient", angleDeg: 90, stops: [
      { offset: 0, color: "#101010" }, { offset: 1, color: "#303030" },
    ] },
    opacity: 1,
  }));
  layers = appendStillMediaLayer(layers, source, SRGB_STRAIGHT_PICTURE, extent, fit, sealMediaSampleLayerSpec({

    id: "content",
    appearance,
  }));
  return layers;
}

function preparedTimed(id = "timed", withAudio = true): PreparedMedia {
  const videoStream = {
    kind: "video" as const, index: 0, codecType: "video" as const, codecName: "h264", role: "moving" as const,
    disposition: { default: true, attachedPicture: false }, timingStatus: "admissible" as const,
    timeBase: { numerator: 1, denominator: 30 },
    startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 30 } },
    endPts: { ticks: "60", timeBase: { numerator: 1, denominator: 30 } },
    decodedUnitCount: 60, width: 720, height: 1280,
    sampleAspectRatio: { numerator: 1, denominator: 1 }, rotationDegrees: 0 as const, picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709", colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } as const,
    averageFrameRate: { numerator: 30, denominator: 1 }, nominalFrameRate: { numerator: 30, denominator: 1 },
  };
  const audioStream = {
    kind: "audio" as const, index: 1, codecType: "audio" as const, codecName: "pcm_s16le",
    disposition: { default: true, attachedPicture: false }, timingStatus: "admissible" as const,
    timeBase: { numerator: 1, denominator: 48_000 },
    startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 48_000 } },
    endPts: { ticks: "96000", timeBase: { numerator: 1, denominator: 48_000 } },
    decodedUnitCount: 96_000, sampleRate: 48_000, channels: 2, decodedSampleFrames: 96_000,
  };
  return prepareMedia({
    id: `prepared-${id}`,
    source: { kind: "blob", resource: fixtureResource(`source:${id}`), size: 10_000, mediaType: "video/mp4" },
    inspection: { container: { formatNames: ["mp4"] }, streams: withAudio ? [videoStream, audioStream] : [videoStream] },
    selection: { videoStreamIndex: 0, ...(withAudio ? { audioStreamIndex: 1 } : {}), spanAuthority: "video",
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alphaMode: "opaque" } },
  });
}

function timedLayers(
  id: string,
  withAudio = true,
  sampling: TemporalRelationSpec = loopSampling(),
): MediaLayerSet {
  return appendTimedMediaLayer(createMediaLayerSet(), preparedTimed(id, withAudio), fit, sealMediaSampleLayerSpec({

    id: "video",
    sampling,
    appearance,
  }));
}

const startPoint = (offsetFrames = 0) => ({ edge: "start" as const,
  offset: { unit: "frames" as const, value: offsetFrames } });
const endPoint = (offsetFrames = 0) => ({ edge: "end" as const,
  offset: { unit: "frames" as const, value: offsetFrames } });
const fullBounds = () => ({ from: startPoint(), until: endPoint() });

function loopSampling(): TemporalRelationSpec {
  return { relations: [{
    kind: "rate",
    target: fullBounds(),
    targetAt: startPoint(),
    sourceAt: startPoint(),
    rate: { numerator: 1, denominator: 1 },
    source: fullBounds(),
    wrap: fullBounds(),
  }] };
}

test("a Clip keeps ordered Paint/sample layers, two-frame fit and frame treatment package-owned", () => {
  const program = finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, stillLayers(), frame, clipSpec(),
  ), header, space);
  assert.deepEqual(program.clips[0]?.span, { startFrame: 0, endFrameExclusive: 120 });
  assert.deepEqual(program.clips[0]?.layers.map((layer) => layer.id), ["backing", "content"]);
  const track = projectVisualTrack(space, program);
  assert.equal(track.items[0]?.id, "product");
  const elements = loweredClipElements(program);
  assert.deepEqual(elements.slice(0, 3).map((element) => element.id), [
    "product:placement", "product:pose", "product:frame",
  ]);
  const media = elements.find((element) => element.id === "content");
  assert.equal(media?.kind, "image");
  const sample = program.clips[0]!.layers.find((layer) => layer.kind === "sample");
  assert.deepEqual(sample?.kind === "sample" ? sample.mapping : undefined,
    { xx: 0.345, xy: 0, yx: 0, yy: 0.345, tx: 162, ty: 212 });
  const sampling = elements.find((element) => element.id === "content:sampling");
  assert.deepEqual(sampling?.style, [
    { name: "height", value: "100%" },
    { name: "left", value: 0 },
    { name: "position", value: "absolute" },
    { name: "top", value: 0 },
    { name: "transform-origin", value: "198px 148px" },
    { name: "width", value: "100%" },
  ]);
  const mapping = elements.find((element) => element.id === "content:mapping");
  assert.deepEqual(mapping?.style, [
    { name: "height", value: "800px" },
    { name: "left", value: 0 },
    { name: "position", value: "absolute" },
    { name: "top", value: 0 },
    { name: "transform", value: "matrix(0.345,0,0,0.345,60,10)" },
    { name: "transform-origin", value: "0 0" },
    { name: "width", value: "800px" },
  ]);
});

test("an owned clip path is an explicit Visual input and lowers only over the Clip's pixels", () => {
  // A Path is drawn in program-picture pixels. The Frame
  // sits at 100,200, so a trapezoid filling it is written from there and arrives at the Frame's own
  // box translated back to 0,0.
  const clipped = bindVisualClipPath(clipSpec(), {
    commands: [
      { kind: "move", xPx: 100, yPx: 200 },
      { kind: "line", xPx: 500, yPx: 200 },
      { kind: "line", xPx: 460, yPx: 500 },
      { kind: "line", xPx: 140, yPx: 500 },
      { kind: "close" },
    ],
  });
  const program = finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, stillLayers(), frame, clipped,
  ), header, space);
  const frameElement = loweredClipElements(program).find((element) => element.id.endsWith(":frame"));
  assert.equal(frameElement?.style.find((entry) => entry.name === "clip-path")?.value,
    'path("M 0 0 L 400 0 L 360 300 L 40 300 Z")');
});

test("an explicit source mapping survives Program resolution and renderer lowering without becoming a content box", () => {
  const mapping = { xx: 0, xy: -0.5, yx: 0.5, yy: 0, tx: 420, ty: 240 };
  const layers = appendMappedStillMediaLayer(
    createMediaLayerSet(), source, SRGB_STRAIGHT_PICTURE, extent, mapping,
    sealMediaSampleLayerSpec({ id: "mapped", appearance }),
  );
  const program = finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, layers, frame,
    clipSpec({ treatment: { clip: { kind: "frame" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 }, shadows: [] } }),
  ), header, space);
  const sample = program.clips[0]!.layers.find((layer) => layer.kind === "sample");
  assert.deepEqual(sample?.kind === "sample" ? sample.mapping : undefined, mapping);
  const element = loweredClipElements(program).find((candidate) => candidate.id === "mapped:mapping");
  assert.ok(element?.style.some((entry) => entry.name === "transform"
    && entry.value === "matrix(0,0.5,-0.5,0,320,40)"));
});

test("self-blur is two explicit samples of one Resource and collection keeps one reference", () => {
  let layers = createMediaLayerSet();
  layers = appendStillMediaLayer(layers, source, SRGB_STRAIGHT_PICTURE, extent, { ...fit, sizing: "cover" }, sealMediaSampleLayerSpec({
    id: "blurred", appearance: {
      opacity: 1, filter: { blurPx: 24, brightness: 0.7, contrast: 1, saturation: 0.8 },
    },
  }));
  layers = appendStillMediaLayer(layers, source, SRGB_STRAIGHT_PICTURE, extent, fit, sealMediaSampleLayerSpec({
    id: "foreground", appearance,
  }));
  const program = finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, layers, frame, clipSpec(),
  ), header, space);
  const track = projectVisualTrack(space, program);
  const document = compileHtmlProgram(sealComposition({ id: "media", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  assert.equal(document.artifacts.length, 1);
  const artifactId = document.artifacts[0]!.id;
  assert.equal((document.html.match(new RegExp(artifactId, "gu")) ?? []).length, 2,
    "HTML names the same Programme-local Artifact at both sampling sites");
  assert.equal((document.html.match(/hypit-artifact:\/\/artifact-/gu) ?? []).length, 2);
  const localElements = loweredClipElements(program);
  const blurAppearance = localElements.find((element) => element.id === "blurred:appearance");
  assert.equal(blurAppearance?.style.find((entry) => entry.name === "filter")?.value,
    "blur(24px) brightness(0.7) saturate(0.8)");
  const blurred = localElements.find((element) => element.id === "blurred");
  assert.equal(blurred?.style.find((entry) => entry.name === "left")?.value, "-103px");
  assert.equal(blurred?.style.find((entry) => entry.name === "top")?.value, "-103px");
});

test("piecewise temporal sampling, Clip pose and picture sampling remain separate wrapper channels", () => {
  let layers = createMediaLayerSet();
  layers = appendTimedMediaLayer(layers, preparedTimed(), fit, sealMediaSampleLayerSpec({

    id: "video",
    sampling: { relations: [
      {
        kind: "rate",
        target: { from: startPoint(), until: startPoint(30) },
        targetAt: startPoint(),
        sourceAt: startPoint(10),
        rate: { numerator: 1, denominator: 1 },
        source: { from: startPoint(10), until: startPoint(40) },
      },
      {
        kind: "rate",
        target: { from: startPoint(30), until: endPoint() },
        targetAt: startPoint(30),
        sourceAt: startPoint(39),
        rate: { numerator: 0, denominator: 1 },
        source: { from: startPoint(10), until: startPoint(40) },
      },
    ] },
    appearance,
    samplingMotion: { keyframes: [
      { atProgress: 0, zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
      { atProgress: 0.5, zoom: 1.1, offsetX: 10, offsetY: -5, rotationDeg: 1 },
      { atProgress: 1, zoom: 1.2, offsetX: 20, offsetY: -10, rotationDeg: 2, easing: "ease-out" },
    ] },
  }));
  const program = finalizeVisualTrack(appendProgramVisualClip(createVisualTrackSet(), header, semantic, layers, frame, clipSpec({
    motion: {
      keyframes: [
        { at: { kind: "start", offsetFrames: 0 }, translateX: 0, translateY: 120, scaleX: 1, scaleY: 1,
          rotationDeg: 0, opacity: 0, originX: 0.5, originY: 0.5, easing: "ease-out" },
        { at: { kind: "start", offsetFrames: 12 }, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1,
          rotationDeg: 0, opacity: 1, originX: 0.5, originY: 0.5 },
        { at: { kind: "end", offsetFrames: -10 }, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1,
          rotationDeg: 0, opacity: 1, originX: 0.5, originY: 0.5, easing: "ease-in" },
        { at: { kind: "end", offsetFrames: 0 }, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1,
          rotationDeg: 0, opacity: 0, originX: 0.5, originY: 0.5 },
      ],
    },
  })), header, space);
  const elements = loweredClipElements(program);
  assert.ok(elements.find((element) => element.id.endsWith(":pose"))?.animation);
  const samplingWrapper = elements.find((element) => element.id === "video:sampling");
  assert.ok(samplingWrapper?.animation);
  assert.deepEqual(samplingWrapper?.animation?.keyframes.map((entry) => entry.atFrame), [0, 60, 120]);
  const video = elements.find((element) => element.id === "video");
  assert.equal(video?.kind, "video");
  const pieces = video.kind === "video" ? video.sampling.stages[0]?.pieces : undefined;
  assert.deepEqual(pieces?.map((piece) => {
    assert.ok(isAffineTemporalMapPiece(piece));
    return ({
    target: {
      startFrame: Number(temporalValueInFrames(piece.target.start, space).numerator),
      endFrameExclusive: Number(temporalValueInFrames(piece.target.end, space).numerator),
    },
    sourceAtStart: (() => { const value = temporalValueInFrames(piece.sourceAtStart,
      { frameRate: { numerator: 30, denominator: 1 } });
    return { numerator: Number(value.numerator), denominator: Number(value.denominator) }; })(),
    rate: piece.rate,
  }); }), [
    { target: { startFrame: 0, endFrameExclusive: 30 }, sourceAtStart: { numerator: 10, denominator: 1 }, rate: { numerator: 1, denominator: 1 } },
    { target: { startFrame: 30, endFrameExclusive: 120 }, sourceAtStart: { numerator: 39, denominator: 1 }, rate: { numerator: 0, denominator: 1 } },
  ]);
});

test("Prepared Media reaches the terminal visual program without an intermediate CFR artifact", () => {
  const layers = appendTimedMediaLayer(
    createMediaLayerSet(),
    preparedTimed("alternate-rate"),
    fit,
    sealMediaSampleLayerSpec({ id: "video", appearance }),
  );
  const track = projectVisualTrack(space, finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, layers, frame, clipSpec(),
  ), header, space));
  const document = compileHtmlProgram(sealComposition({ id: "alternate-rate", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: { members: [{ kind: "track", id: track.id, track }] } }, audio: { contributions: [] } }, space));
  const source = document.videoSources[0];
  assert.equal(source?.kind, "media");
  if (source?.kind !== "media") throw new Error("Expected direct Prepared Media source");
  assert.equal(source.source.streamIndex, 0);
  assert.equal(source.source.source.resource, fixtureResource("source:alternate-rate"));
});

test("a cubic Clip relation remains exact through Prepared Media and the terminal visual program", () => {
  const curve: TemporalRelationSpec = { relations: [{
    kind: "cubic",
    target: fullBounds(),
    sourceAtStart: startPoint(),
    sourceControl1: startPoint(),
    sourceControl2: endPoint(),
    sourceAtEnd: endPoint(),
  }] };
  const track = projectVisualTrack(space, finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, timedLayers("cubic", false, curve), frame, clipSpec(),
  ), header, space));
  const document = compileHtmlProgram(sealComposition({ id: "cubic", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: { members: [{ kind: "track", id: track.id, track }] } }, audio: { contributions: [] } }, space));
  const source = document.videoSources[0];
  assert.equal(source?.kind, "media");
  if (source?.kind !== "media") throw new Error("Expected direct Prepared Media source");
  assert.deepEqual(evaluateTemporalMap(source.sampling, exactTemporalValueFromFrames(30, space)), {
    ticks: "5",
    timeBase: { numerator: 1, denominator: 16 },
  });
  assert.deepEqual(evaluateTemporalMap(source.sampling, exactTemporalValueFromFrames(60, space)), {
    ticks: "1",
    timeBase: { numerator: 1, denominator: 1 },
  });
});

test("still and animated typed Surfaces use the same layer law without browser format guesses", () => {
  const still: CompositableSurfaceRef = {
    artifact: { kind: "blob", resource: fixtureResource("surface:still"), size: 500, mediaType: "image/png" },
    width: 100,
    height: 100,
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const,
    timing: { kind: "still" },
  };
  const animated: CompositableSurfaceRef = {
    ...still,
    artifact: { kind: "blob", resource: fixtureResource("surface:animated"), size: 2_000, mediaType: "video/webm" },
    timing: { kind: "frames", frameRate: { numerator: 30, denominator: 1 }, frameCount: 30 },
  };
  let layers = appendSurfaceMediaLayer(createMediaLayerSet(), still, fit, sealMediaSampleLayerSpec({
    id: "still", appearance,
  }));
  layers = appendSurfaceMediaLayer(layers, animated, fit, sealMediaSampleLayerSpec({
    id: "animated", sampling: loopSampling(), appearance,
  }));
  const elements = presentElements(projectVisualTrack(space, finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, layers, frame, clipSpec(),
  ), header, space)).items[0]!);
  assert.equal(elements.find((element) => element.id === "still")?.kind, "surface");
  const moving = elements.find((element) => element.id === "animated");
  assert.equal(moving?.kind, "surface");
  assert.ok(moving?.kind === "surface" && moving.sampling !== undefined);
  const defaulted = appendSurfaceMediaLayer(createMediaLayerSet(), animated, fit, sealMediaSampleLayerSpec({
    id: "defaulted", appearance,
  }));
  assert.equal(defaulted.layers[0]?.kind === "sample" ? defaulted.layers[0].sampling?.kind : undefined, "relation");
  assert.deepEqual(defaulted.layers[0]?.kind === "sample" && defaulted.layers[0].sampling?.kind === "relation"
    ? defaulted.layers[0].sampling.value : undefined, defaultTemporalRelationSpec());
});

test("Visual Clips consume independent absolute Windows without becoming an exclusive lane", () => {
  const selection: NarrativeSelectionRef = {
    narrativeId: "script",
    id: "mentions",
    startAnchorId: "a",
    endAnchorId: "b",
  };
  const selected = appendSelectionVisualClip(createVisualTrackSet(), header, semantic, stillLayers(), frame,
    selection, clipSpec({
      id: "mention",
      projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
    }));
  assert.deepEqual(selected.clips.map((item) => item.span), [{ startFrame: 15, endFrameExclusive: 45 }]);
  const moment: NarrativeMomentRef = {
    narrativeId: "script",
    id: "cue", anchorId: "b",
  };
  const overlapping = appendMomentVisualClip(selected, header, semantic, stillLayers(), frame,
    moment, clipSpec({
      id: "popup",
      projection: { start: { ref: "moment.cue", offset: { unit: "frames", value: -10 } }, end: { ref: "moment.cue", offset: { unit: "frames", value: 20 } } },
    }));
  assert.deepEqual(overlapping.clips[1]?.span, { startFrame: 35, endFrameExclusive: 65 });
  const track = projectVisualTrack(space, finalizeVisualTrack(overlapping, header, space));
  assert.deepEqual(track.items.map((present) => present.id), ["mention", "popup"]);

  const absolute = appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, stillLayers(), frame,
    clipSpec({
      id: "absolute",
      projection: {
        start: { ref: "absolute", at: { unit: "frames", value: 7 } },
        end: { ref: "absolute", at: { unit: "frames", value: 19 } },
      },
    }),
  );
  assert.deepEqual(absolute.clips[0]?.span, { startFrame: 7, endFrameExclusive: 19 });
});

test("overlapping Clips retain their authored Track-local order", () => {
  const first = appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, stillLayers(), frame,
    clipSpec({ id: "first", projection: {
      start: { ref: "absolute", at: { unit: "frames", value: 10 } },
      end: { ref: "absolute", at: { unit: "frames", value: 40 } },
    } }),
  );
  const second = appendProgramVisualClip(
    first, header, semantic, stillLayers(), frame,
    clipSpec({ id: "second", projection: {
      start: { ref: "absolute", at: { unit: "frames", value: 30 } },
      end: { ref: "absolute", at: { unit: "frames", value: 50 } },
    } }),
  );
  const program = finalizeVisualTrack(second, header, space);
  assert.deepEqual(program.clips.map(({ id }) => id), ["first", "second"]);
});

test("a Transition applies a package-owned effect over the exact Clip intersection", () => {
  const outgoingWindow = projectProgramWindow({ itemId: "outgoing-window", semantic,
    projection: {
      start: { ref: "absolute", at: { unit: "frames", value: 0 } },
      end: { ref: "absolute", at: { unit: "frames", value: 60 } },
    } });
  const incomingWindow = projectProgramWindow({ itemId: "incoming-window", semantic,
    projection: {
      start: { ref: "absolute", at: { unit: "frames", value: 45 } },
      end: { ref: "absolute", at: { unit: "frames", value: 100 } },
    } });
  let set = appendVisualClip(createVisualTrackSet(), header, space, stillLayers(), frame,
    clipSpec({ id: "outgoing" }), outgoingWindow);
  set = appendVisualClip(set, header, space, stillLayers(), frame,
    clipSpec({ id: "incoming" }), incomingWindow);
  const pair = set;
  const effect = crossDissolveEffect("ease-in-out");
  set = appendVisualTransition(set, {
    id: "handoff", outgoingClipId: "outgoing", incomingClipId: "incoming", effect,
  });
  const program = finalizeVisualTrack(set, header, space);
  assert.deepEqual(program.transitions, [{
    id: "handoff", outgoingClipId: "outgoing", incomingClipId: "incoming", effect,
  }]);
  assert.deepEqual(visualTransitionSpan(program.transitions[0]!, program.clips),
    { startFrame: 45, endFrameExclusive: 60 });
  const projected = projectVisualTrack(space, program);
  const process = projected.items.find((item) => item.kind === "process");
  assert.ok(process?.kind === "process");
  assert.deepEqual(process.span, { startFrame: 45, endFrameExclusive: 60 });
  assert.deepEqual(process.inputs.map(({ name, contribution }) => ({ name, id: contribution.id })), [
    { name: "outgoing", id: "outgoing" }, { name: "incoming", id: "incoming" },
  ]);
  assert.deepEqual(process.effect, effect);

  assert.throws(() => appendVisualTransition(pair, {
    id: "reversed", outgoingClipId: "incoming", incomingClipId: "outgoing", effect,
  }), /adjacent in Track paint order/u);
  assert.throws(() => appendVisualTransition({
    clips: [pair.clips[0]!, {
      ...pair.clips[1]!, span: { startFrame: 60, endFrameExclusive: 100 },
    }],
    transitions: [],
  }, {
    id: "disjoint", outgoingClipId: "outgoing", incomingClipId: "incoming", effect,
  }), /requires overlapping Clip Windows/u);
  assert.throws(() => appendVisualTransition(pair, {
    id: "outgoing", outgoingClipId: "outgoing", incomingClipId: "incoming", effect,
  }), /conflicts with a Clip id/u);
});

test("a timed Transition reaches HTML with both Prepared Media clocks intact", () => {
  const outgoingWindow = projectProgramWindow({ itemId: "timed-outgoing-window", semantic,
    projection: {
      start: { ref: "absolute", at: { unit: "frames", value: 0 } },
      end: { ref: "absolute", at: { unit: "frames", value: 60 } },
    } });
  const incomingWindow = projectProgramWindow({ itemId: "timed-incoming-window", semantic,
    projection: {
      start: { ref: "absolute", at: { unit: "frames", value: 45 } },
      end: { ref: "absolute", at: { unit: "frames", value: 100 } },
    } });
  let set = appendVisualClip(createVisualTrackSet(), header, space, timedLayers("transition-outgoing"), frame,
    clipSpec({ id: "timed-outgoing" }), outgoingWindow);
  set = appendVisualClip(set, header, space, timedLayers("transition-incoming"), { ...frame, xPx: 220 },
    clipSpec({ id: "timed-incoming" }), incomingWindow);
  set = appendVisualTransition(set, {
    id: "timed-handoff",
    outgoingClipId: "timed-outgoing",
    incomingClipId: "timed-incoming",
    effect: crossDissolveEffect(),
  });
  const track = projectVisualTrack(space, finalizeVisualTrack(set, header, space));
  const process = track.items.find((item) => item.kind === "process");
  assert.ok(process?.kind === "process");
  assert.deepEqual(process.span, { startFrame: 45, endFrameExclusive: 60 });
  assert.deepEqual(process.inputs.map(({ name, contribution }) => ({ name, span: contribution.span })), [
    { name: "outgoing", span: { startFrame: 0, endFrameExclusive: 60 } },
    { name: "incoming", span: { startFrame: 45, endFrameExclusive: 100 } },
  ]);

  const document = compileHtmlProgram(sealComposition({ id: "timed-transition", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: { members: [{ kind: "track", id: track.id, track }] } }, audio: { contributions: [] } }, space));
  const sourceSpans = new Map<string, { startFrame: number; endFrameExclusive: number }[]>();
  for (const video of document.videoSources) {
    if (video.kind !== "media") continue;
    const spans = sourceSpans.get(video.source.source.resource) ?? [];
    spans.push({ startFrame: video.startFrame, endFrameExclusive: video.endFrameExclusive });
    sourceSpans.set(video.source.source.resource, spans);
  }
  assert.ok(sourceSpans.get(fixtureResource("source:transition-outgoing"))?.some((span) =>
    span.startFrame === 0 && span.endFrameExclusive === 60));
  assert.ok(sourceSpans.get(fixtureResource("source:transition-incoming"))?.some((span) =>
    span.startFrame === 45 && span.endFrameExclusive === 100));
  assert.match(document.html, /data-hypit-process-id="timed-handoff"/u);
  assert.match(document.html, /mix-blend-mode:\s*plus-lighter/u);
});

test("one resolved Window can time distinct Visual Clip occurrences", () => {
  const shared = projectProgramWindow({ itemId: "shared-window", semantic,
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: { unit: "frames", value: 30 } } } });
  let set = appendVisualClip(createVisualTrackSet(), header, space, stillLayers(), frame,
    clipSpec({ id: "first" }), shared);
  set = appendVisualClip(set, header, space, stillLayers(), frame, clipSpec({ id: "second" }), shared);
  assert.deepEqual(set.clips.map((clip) => clip.id), ["first", "second"]);
  assert.deepEqual(set.clips.map((clip) => clip.span), [shared.span, shared.span]);
});

test("VisualTrackSet refinement validates accumulated Clips in declaration order", () => {
  const shared = projectProgramWindow({ itemId: "shared-window", semantic,
    projection: { start: { ref: "timeline.start" }, end: { ref: "absolute", at: { unit: "frames", value: 30 } } } });
  const set = appendVisualClip(createVisualTrackSet(), header, space, stillLayers(), frame,
    clipSpec({ id: "first" }), shared);
  assert.doesNotThrow(() => assertVisualTrackSet(set));
  assert.throws(() => assertVisualTrackSet({ clips: [set.clips[0]!, structuredClone(set.clips[0]!)], transitions: [] }),
    /repeats first/u);
  assert.throws(() => assertVisualTrackSet({ clips: [{ ...set.clips[0]!, layers: [] }], transitions: [] }),
    /requires layers/u);
});

test("a Visual Clip can consume one whole Narrative Segment directly", () => {
  const result = appendSegmentVisualClip(
    createVisualTrackSet(), header, semantic, stillLayers(), frame,
    { narrativeId: "script", kind: "segment", id: "answer", tokenStart: 0, tokenEndExclusive: 1 },
    clipSpec({
      id: "whole-answer",
      projection: { start: { ref: "segment.start" }, end: { ref: "segment.end" } },
    }),
  );
  assert.deepEqual(result.clips.map((item) => item.span), [{ startFrame: 30, endFrameExclusive: 90 }]);
});

test("typed Pose motion lowers arbitrary affine states without an effect catalogue or outer Frame", () => {
  const animation = poseAnimation({ keyframes: [
    { at: { kind: "start", offsetFrames: 0 }, translateX: -500, translateY: 20, scaleX: 0.8, scaleY: 1.1,
      rotationDeg: -12, opacity: 0, originX: 0.5, originY: 0.5, easing: "ease-out" },
    { at: { kind: "progress", value: 0.5 }, translateX: 18, translateY: -4, scaleX: 1.04, scaleY: 0.98,
      rotationDeg: 2, opacity: 1, originX: 0.5, originY: 0.5, easing: "ease-in-out" },
    { at: { kind: "end", offsetFrames: 0 }, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1,
      rotationDeg: 0, opacity: 1, originX: 0.5, originY: 0.5 },
  ] }, 30)!;
  assert.deepEqual(animation.keyframes.map((entry) => entry.atFrame), [0, 15, 30]);
  assert.match(String(animation.keyframes[0]!.style.find((item) => item.name === "transform")?.value), /translate\(-500px,20px\)/u);
});

test("every documented Visual frame and fit remains one ordinary Clip instead of a mode", () => {
  const frames = [
    { xPx: 0, yPx: 0, widthPx: 1080, heightPx: 1920 },
    { xPx: 0, yPx: 0, widthPx: 540, heightPx: 1920 },
    { xPx: 80, yPx: 1280, widthPx: 920, heightPx: 500 },
    { xPx: 760, yPx: 80, widthPx: 260, heightPx: 360 },
    { xPx: -120, yPx: 1400, widthPx: 500, heightPx: 600 },
  ];
  const sizings = ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"] as const;
  let set = createVisualTrackSet();
  for (const [index, sizing] of sizings.entries()) {
    const localFit = { ...fit, sizing,
      framePoint: { x: index % 2 === 0 ? 0.2 : 0.8, y: 0.75 },
      contentPoint: { x: 0.65, y: 0.1 },
      constraint: index % 2 === 0 ? "bounded" as const : "free" as const,
    };
    const layers = appendStillMediaLayer(createMediaLayerSet(), source, SRGB_STRAIGHT_PICTURE,
      { widthPx: index % 3 === 0 ? 400 : index % 3 === 1 ? 1200 : 800,
        heightPx: index % 3 === 0 ? 1200 : index % 3 === 1 ? 400 : 800 },
      localFit, sealMediaSampleLayerSpec({ id: `sample-${index}`, appearance }));
    set = appendProgramVisualClip(set, header, semantic, layers, frames[index % frames.length]!, clipSpec({
      id: `fit-${sizing}`,
      treatment: { clip: { kind: "none" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 }, shadows: [] },
    }));
  }
  const program = finalizeVisualTrack(set, header, space);
  const track = projectVisualTrack(space, program);
  assert.equal(track.items.length, sizings.length);
  for (const [index] of track.items.entries()) {
    const placement = lowerVisualClipElement(program.clips[index]!);
    assert.equal(placement.kind, "box");
    assert.ok(placement.style.some((entry) => entry.name === "width" && typeof entry.value === "string"));
    assert.ok(placement.style.some((entry) => entry.name === "height" && typeof entry.value === "string"));
  }
});

test("transparent, Paint, self-blur and alternate-source backing are only ordered owned layers", () => {
  const alternate: BlobRef = { kind: "blob", resource: fixtureResource("media-track:alternate"), size: 2_048, mediaType: "image/webp" };
  let layers = createMediaLayerSet();
  layers = appendMediaPaintLayer(layers, sealMediaPaintLayerSpec({
    id: "solid", paint: { kind: "solid", color: "#101018" }, opacity: 1,
  }));
  layers = appendStillMediaLayer(layers, source, SRGB_STRAIGHT_PICTURE, extent, { ...fit, sizing: "cover" }, sealMediaSampleLayerSpec({
    id: "self-blur", appearance: {
      opacity: 1, filter: { blurPx: 32, brightness: 0.7, contrast: 1.1, saturation: 0.8 },
    },
  }));
  layers = appendStillMediaLayer(layers, alternate, SRGB_STRAIGHT_PICTURE, { ...extent, widthPx: 1200, heightPx: 600 }, { ...fit, sizing: "cover" },
    sealMediaSampleLayerSpec({ id: "alternate", appearance }));
  layers = appendStillMediaLayer(layers, source, SRGB_STRAIGHT_PICTURE, extent, fit,
    sealMediaSampleLayerSpec({ id: "foreground", appearance }));
  const program = finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, layers, frame, clipSpec(),
  ), header, space);
  const track = projectVisualTrack(space, program);
  const document = compileHtmlProgram(sealComposition({ id: "layer-matrix", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 1080, height: 1920, clearColor: "#000000" }, root: { members: [track].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
  assert.deepEqual(presentElements(track.items[0]!).filter((element) => element.kind === "image").map((element) => element.id),
    ["self-blur", "alternate", "foreground"]);
  assert.equal(document.artifacts.length, 2, "repeated samples share bytes while the alternate source remains explicit");

  const transparentProgram = finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic,
    appendStillMediaLayer(createMediaLayerSet(), source, SRGB_STRAIGHT_PICTURE, extent, fit,
      sealMediaSampleLayerSpec({ id: "only", appearance })),
    frame, clipSpec(),
  ), header, space);
  assert.equal(loweredClipElements(transparentProgram).some((element) =>
    element.kind === "box" && element.style.some((entry) => entry.name === "background")), false);
});

test("timed visual sources remain visual whether PreparedMedia also selects audio or not", () => {
  const silent = timedLayers("silent", false);
  const program = finalizeVisualTrack(appendProgramVisualClip(
    createVisualTrackSet(), header, semantic, silent, frame, clipSpec(),
  ), header, space);
  assert.equal(presentElements(projectVisualTrack(space, program).items[0]!).some((element) => element.kind === "video"), true);
  const audible = timedLayers("audible", true).layers[0]!;
  assert.equal(audible.kind === "sample" && "audio" in audible.source, false);
});

test("visual occurrences use the shared temporal relation algebra without frame-rate admission", () => {
  const target = { id: "visual-occurrence", duration: exactTemporalValueFromFrames(50, space) };
  const source = { id: "visual-source-domain", duration: exactTemporalValueFromFrames(30,
    { frameRate: { numerator: 30, denominator: 1 } }) };
  const resolve = (spec?: TemporalRelationSpec) => resolveTemporalRelation({ target, source, clock: space,
    ...(spec === undefined ? {} : { spec }) });
  const frames = (value: ExactTemporalValue, frameRate = space.frameRate) => {
    const result = temporalValueInFrames(value, { frameRate });
    return { numerator: Number(result.numerator), denominator: Number(result.denominator) };
  };
  const piece = (value: TemporalMapPiece) => {
    assert.ok(isAffineTemporalMapPiece(value));
    return ({
    target: { startFrame: frames(value.target.start).numerator, endFrameExclusive: frames(value.target.end).numerator },
    sourceAtStart: frames(value.sourceAtStart, { numerator: 30, denominator: 1 }),
    rate: value.rate,
  }); };
  assert.deepEqual(resolve().stages[0]!.pieces.map(piece).map((item) => item.target),
    [{ startFrame: 0, endFrameExclusive: 30 }]);
  const endAligned: TemporalRelationSpec = { relations: [{
    kind: "rate", target: fullBounds(), targetAt: endPoint(), sourceAt: endPoint(),
    rate: { numerator: 1, denominator: 1 }, source: fullBounds(),
  }] };
  assert.deepEqual(resolve(endAligned).stages[0]!.pieces.map(piece).map((item) => item.target),
    [{ startFrame: 20, endFrameExclusive: 50 }]);
  assert.deepEqual(resolve({ relations: [{
    kind: "rate", target: fullBounds(), targetAt: endPoint(), sourceAt: endPoint(),
    rate: { numerator: 1, denominator: 1 }, source: fullBounds(), wrap: fullBounds(),
  }] }).stages[0]!.pieces.map(piece)[0]?.sourceAtStart, { numerator: 10, denominator: 1 });
  const fitted = resolve({ relations: [{ kind: "fit", target: fullBounds(), source: fullBounds() }] })
    .stages[0]!.pieces[0]!;
  assert.ok(isAffineTemporalMapPiece(fitted));
  assert.deepEqual(fitted.rate, { numerator: 3, denominator: 5 });
  assert.deepEqual(resolve({ relations: [{
    kind: "rate", target: fullBounds(), targetAt: startPoint(), sourceAt: endPoint(),
    rate: { numerator: -1, denominator: 1 }, source: fullBounds(),
  }] }).stages[0]!.pieces.map(piece)[0], {
    target: { startFrame: 0, endFrameExclusive: 30 },
    sourceAtStart: { numerator: 30, denominator: 1 },
    rate: { numerator: -1, denominator: 1 },
  });
  const native24 = resolveTemporalRelation({ clock: space,
    target: { id: "occurrence-24", duration: exactTemporalValueFromFrames(30, space) },
    source: { id: "source-domain-24", duration: exactTemporalValueFromFrames(24,
      { frameRate: { numerator: 24, denominator: 1 } }) } });
  assert.equal(native24.stages[0]?.pieces.length, 1);
});

test("the graph keeps every source, extent, fit, frame, time and treatment input explicit", () => {
  assert.deepEqual(stillVisualTrackFragment.inputs.map((input) => input.name), [
    "clip-spec", "extent", "fit", "frame", "header", "picture", "sample-spec", "source", "timeline", "window",
  ]);
});
