import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";

import { sealComposition } from "@hypit/composition";
import type { AudioTrack } from "@hypit/composition";
import { compileHyperframesDocument } from "@hypit/hyperframes";
import { mediaTypes } from "@hypit/media";
import type { CompositableSurfaceRef, SynchronizedMedia } from "@hypit/media";
import { artifactTypes } from "@hypit/artifact";
import { narrativeTypes } from "@hypit/narrative";
import {
  appendMediaPaintLayer,
  appendMediaSound,
  appendMediaSequenceAtWindow,
  appendMediaSequenceProjectedMember,
  appendProjectedMediaItem,
  appendStillMediaLayer,
  appendSurfaceMediaLayer,
  appendTimedMediaLayer,
  bindMediaItemClipPath,
  createMediaLayerSet,
  createMediaSequenceMemberSet,
  createMediaSoundSet,
  createMediaTrackSet,
  decodeMediaTrackSurface,
  finalizeMediaTrack,
  projectMediaAudioTrack,
  projectMediaVisualTrack,
  lifecycleAnimation,
  resolveMediaLifecycleMotion,
  sustainAnimation,
  resolveVisualSampling,
  sealMediaItemSpec,
  sealMediaHandoffSpec,
  sealMediaPaintLayerSpec,
  sealMediaSampleLayerSpec,
  sealMediaSoundSpec,
  sealMediaSequenceMemberSpec,
  sealMediaSequenceSpec,
  sealMediaTrackHeader,
  stillMediaTrackFragment,
  mediaTrackManifest,
  mediaTrackMarkupSurfaces,
} from "@hypit/media-track";
import type {
  MediaHandoffOperator,
  MediaItemSpec,
  MediaLayerSet,
  MediaSequenceSpec,
} from "@hypit/media-track";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { sealProgramSpace } from "@hypit/program-space";
import { programSpaceTypes } from "@hypit/program-space";
import type { BlobRef } from "@hypit/protocol";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import type { StructuredElement, StructuredNode, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/markup";
import { projectMomentWindow, projectProgramWindow, projectSegmentWindow, projectSelectionWindow } from "@hypit/temporal";
import type { TemporalWindow, TemporalWindowProjection } from "@hypit/temporal";

const space = sealProgramSpace({
  durationSec: 4,
  frameRate: { numerator: 30, denominator: 1 },
});
const canvas = {
  widthPx: 1080,
  heightPx: 1920,
  origin: "top-left" as const,
  xDirection: "right" as const,
  yDirection: "down" as const,
  pixelAspect: "square" as const,
};
const header = sealMediaTrackHeader({ id: "proof" });
const semantic = semanticTrackFixture(space, {
  segments: [
    { id: "opening", frameCount: 30 },
    { id: "answer", frameCount: 60 },
    { id: "ending", frameCount: 30 },
  ],
  anchors: [
    { identity: "a", frame: 15 }, { identity: "b", frame: 45 },
    { identity: "c", frame: 60 }, { identity: "d", frame: 105 },
  ],
});
const source: BlobRef = {
  kind: "blob",
  digest: fixtureDigest("media-track:still"),
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

type TestMediaItemSpec = MediaItemSpec & { readonly projection: TemporalWindowProjection };
const defaultItemProjection: TemporalWindowProjection = {
  start: { ref: "program.start" }, end: { ref: "program.end" },
};

function itemSpec(overrides: Partial<TestMediaItemSpec> = {}): TestMediaItemSpec {
  const { projection = defaultItemProjection, ...itemOverrides } = overrides;
  return {
    ...sealMediaItemSpec({

    id: "product",
    presentation: {
      clip: { kind: "rounded", radiusPx: 20 },
      padding: { topPx: 10, rightPx: 10, bottomPx: 10, leftPx: 10 },
      border: { widthPx: 2, style: "solid", color: "#ffffff" },
      shadows: [{ offsetX: 0, offsetY: 8, blurPx: 20, spreadPx: 0, color: "#00000080" }],
    },
    motion: { sustain: [] },
    stackingOrder: 40,
    ...itemOverrides,
    }),
    projection,
  };
}

function appendProgramMediaItem(
  set: ReturnType<typeof createMediaTrackSet>, trackHeader: typeof header, semanticTrack: typeof semantic,
  canvasSpace: typeof canvas, layers: MediaLayerSet, frameValue: typeof frame, authored: MediaItemSpec | TestMediaItemSpec,
  sounds: ReturnType<typeof createMediaSoundSet>,
) {
  const projection = "projection" in authored ? authored.projection : defaultItemProjection;
  const { projection: _ignored, ...spec } = authored as TestMediaItemSpec;
  return appendProjectedMediaItem(set, trackHeader, semanticTrack, canvasSpace, layers, frameValue, spec, sounds,
    projectProgramWindow({ itemId: spec.id, semantic: semanticTrack, projection }));
}

function appendSelectionMediaItem(
  set: ReturnType<typeof createMediaTrackSet>, trackHeader: typeof header, semanticTrack: typeof semantic,
  canvasSpace: typeof canvas, layers: MediaLayerSet, frameValue: typeof frame, selection: NarrativeSelectionRef,
  authored: TestMediaItemSpec, sounds: ReturnType<typeof createMediaSoundSet>,
) {
  const { projection, ...spec } = authored;
  return appendProjectedMediaItem(set, trackHeader, semanticTrack, canvasSpace, layers, frameValue, spec, sounds,
    projectSelectionWindow({ itemId: spec.id, semantic: semanticTrack, selection, projection }));
}

function appendSegmentMediaItem(
  set: ReturnType<typeof createMediaTrackSet>, trackHeader: typeof header, semanticTrack: typeof semantic,
  canvasSpace: typeof canvas, layers: MediaLayerSet, frameValue: typeof frame, segment: { kind: "segment"; id: string; tokenStart: number; tokenEndExclusive: number },
  authored: TestMediaItemSpec, sounds: ReturnType<typeof createMediaSoundSet>,
) {
  const { projection, ...spec } = authored;
  return appendProjectedMediaItem(set, trackHeader, semanticTrack, canvasSpace, layers, frameValue, spec, sounds,
    projectSegmentWindow({ itemId: spec.id, semantic: semanticTrack, segment, projection }));
}

function appendMomentMediaItem(
  set: ReturnType<typeof createMediaTrackSet>, trackHeader: typeof header, semanticTrack: typeof semantic,
  canvasSpace: typeof canvas, layers: MediaLayerSet, frameValue: typeof frame, moment: NarrativeMomentRef,
  authored: TestMediaItemSpec, sounds: ReturnType<typeof createMediaSoundSet>,
) {
  const { projection, ...spec } = authored;
  return appendProjectedMediaItem(set, trackHeader, semanticTrack, canvasSpace, layers, frameValue, spec, sounds,
    projectMomentWindow({ itemId: spec.id, semantic: semanticTrack, moment, projection }));
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
  layers = appendStillMediaLayer(layers, source, extent, fit, sealMediaSampleLayerSpec({

    id: "content",
    appearance,
  }));
  return layers;
}

function timed(id = "timed", withAudio = true): SynchronizedMedia {
  const sampleFrames = 96_000;
  return {
    timeline: {
      frameRate: { numerator: 30, denominator: 1 },
      frameCount: 60,
    },
    visual: {
      artifact: { kind: "blob", digest: fixtureDigest(`video:${id}`), size: 10_000, mediaType: "video/mp4" },
      width: 720,
      height: 1280,
    },
    ...(withAudio ? { audio: {
      artifact: { kind: "blob" as const, digest: fixtureDigest(`audio:${id}`), size: sampleFrames * 4, mediaType: "audio/wav" },
    } } : {}),
  };
}

function timedLayers(id: string, withAudio = true): MediaLayerSet {
  return appendTimedMediaLayer(createMediaLayerSet(), timed(id, withAudio), fit, sealMediaSampleLayerSpec({

    id: "video",
    occupancy: { mode: "loop", align: "start" },
    appearance,
  }));
}

function sequenceMembers(
  activations: readonly number[] = [0, 40, 80],
  layerFactory: (index: number) => MediaLayerSet = (index) => timedLayers(`member-${index + 1}`),
) {
  let members = createMediaSequenceMemberSet();
  for (const [index, activationFrame] of activations.entries()) {
    const spec = sealMediaSequenceMemberSpec({

      id: `member-${index + 1}`,
      sourceAudio: { fromLayer: "video", gain: 1 - (index * 0.1) },
    });
    members = appendMediaSequenceProjectedMember(members, layerFactory(index), spec, {
      id: `${spec.id}::test`,
      source: { kind: "program", id: "program" },
      projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
      span: { startFrame: activationFrame, endFrameExclusive: activationFrame + 1 },
    });
  }
  return members;
}

function testProgramWindow(endFrameExclusive: number): TemporalWindow {
  return {
    id: "program::test",
    source: { kind: "program", id: "program" },
    projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
    span: { startFrame: 0, endFrameExclusive },
  };
}

function appendMediaSequence(
  set: ReturnType<typeof createMediaTrackSet>, trackHeader: typeof header, _space: typeof space, _canvas: typeof canvas,
  members: ReturnType<typeof createMediaSequenceMemberSet>, frameValue: typeof frame, spec: MediaSequenceSpec,
  sounds: ReturnType<typeof createMediaSoundSet>, terminalFrame: number,
) {
  return appendMediaSequenceAtWindow(set, trackHeader, semantic, canvas, members, frameValue, spec, sounds,
    testProgramWindow(terminalFrame));
}

function appendMediaSequenceMember(
  set: ReturnType<typeof createMediaSequenceMemberSet>, layers: MediaLayerSet, spec: ReturnType<typeof sealMediaSequenceMemberSpec>, activationFrame: number,
) {
  return appendMediaSequenceProjectedMember(set, layers, spec, {
    id: `${spec.id}::test`,
    source: { kind: "program", id: "program" },
    projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
    span: { startFrame: activationFrame, endFrameExclusive: activationFrame + 1 },
  });
}

function sequenceSpec(overrides: Partial<MediaSequenceSpec> = {}): MediaSequenceSpec {
  return sealMediaSequenceSpec({

    id: "steps",
    presentation: itemSpec().presentation,
    motion: {
      enter: { operator: "fade", durationFrames: 12, easing: "ease-out" },
      sustain: [{ operator: "float", amount: 4, cycles: 2 }],
      exit: { operator: "slide", durationFrames: 10, easing: "ease-in", direction: "down", amount: 60 },
    },
    stackingOrder: 50,
    handoffs: [
      sealMediaHandoffSpec({
        id: "one-two", fromMemberId: "member-1", toMemberId: "member-2",
        operator: "crossfade", durationFrames: 20, boundaryRatio: 0.5, audio: "crossfade",
      }),
      sealMediaHandoffSpec({
        id: "two-three", fromMemberId: "member-2", toMemberId: "member-3",
        operator: "push", durationFrames: 20, boundaryRatio: 0.5, direction: "left", audio: "cut",
      }),
    ],
    ...overrides,
  });
}

function sequenceSounds() {
  let sounds = createMediaSoundSet();
  for (const [id, trigger] of [
    ["enter-sound", { kind: "enter" as const }],
    ["handoff-out-sound", { kind: "handoff" as const, handoffId: "one-two" }],
    ["handoff-in-sound", { kind: "handoff" as const, handoffId: "one-two" }],
    ["exit-sound", { kind: "exit" as const }],
  ] as const) {
    sounds = appendMediaSound(sounds, timed(`sfx-${id}`), sealMediaSoundSpec({
      id, trigger, gain: 0.5,
    }));
  }
  return sounds;
}

test("an Item keeps ordered Paint/sample layers, two-frame fit and frame presentation package-owned", () => {
  const program = finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, stillLayers(), frame, itemSpec(), createMediaSoundSet(),
  ), header, space);
  assert.deepEqual(program.items[0]?.span, { startFrame: 0, endFrameExclusive: 120 });
  assert.deepEqual(program.items[0]?.layers.map((layer) => layer.id), ["backing", "content"]);
  const track = projectMediaVisualTrack(space, program);
  assert.deepEqual(track.presents[0]?.stacking, { order: 40, tieBreak: "proof:product::program" });
  const elements = track.presents[0]!.elements;
  assert.deepEqual(elements.slice(0, 3).map((element) => element.id), [
    "product::program:placement", "product::program:lifecycle", "product::program:frame",
  ]);
  const media = elements.find((element) => element.id === "content");
  assert.equal(media?.kind, "image");
  const wrapper = elements.find((element) => element.id === "content:sampling");
  assert.deepEqual(wrapper?.style, [
    { name: "height", value: "280px" },
    { name: "left", value: "60px" },
    { name: "position", value: "absolute" },
    { name: "top", value: "10px" },
    { name: "transform-origin", value: "center center" },
    { name: "width", value: "280px" },
  ]);
});

test("an owned clip path is an explicit Media input and lowers only over the Item's pixels", () => {
  const clipped = bindMediaItemClipPath(itemSpec(), {
    commands: [
      { kind: "move", xPx: 0, yPx: 0 },
      { kind: "line", xPx: 400, yPx: 0 },
      { kind: "line", xPx: 360, yPx: 300 },
      { kind: "line", xPx: 40, yPx: 300 },
      { kind: "close" },
    ],
  });
  const track = projectMediaVisualTrack(space, finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, stillLayers(), frame, clipped, createMediaSoundSet(),
  ), header, space));
  const frameElement = track.presents[0]!.elements.find((element) => element.id.endsWith(":frame"));
  assert.equal(frameElement?.style.find((entry) => entry.name === "clip-path")?.value,
    'path("M 0 0 L 400 0 L 360 300 L 40 300 Z")');
});

test("self-blur is two explicit samples of one Artifact and Artifact collection deduplicates bytes", () => {
  let layers = createMediaLayerSet();
  layers = appendStillMediaLayer(layers, source, extent, { ...fit, sizing: "cover" }, sealMediaSampleLayerSpec({
    id: "blurred", appearance: {
      opacity: 1, filter: { blurPx: 24, brightness: 0.7, contrast: 1, saturation: 0.8 },
    },
  }));
  layers = appendStillMediaLayer(layers, source, extent, fit, sealMediaSampleLayerSpec({
    id: "foreground", appearance,
  }));
  const track = projectMediaVisualTrack(space, finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, layers, frame, itemSpec(), createMediaSoundSet(),
  ), header, space));
  const document = compileHyperframesDocument(sealComposition({
    id: "media",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [track],
  }), space);
  assert.equal(document.artifacts.length, 1);
  assert.equal((document.html.match(new RegExp(source.digest, "gu")) ?? []).length, 0,
    "HTML uses artifact URIs without the digest prefix spelling");
  assert.equal((document.html.match(/hypit-artifact:\/\/sha256\//gu) ?? []).length, 2);
  const blurred = track.presents[0]!.elements.find((element) => element.id === "blurred");
  assert.equal(blurred?.style.find((entry) => entry.name === "left")?.value, "-48px");
  assert.equal(blurred?.style.find((entry) => entry.name === "top")?.value, "-48px");
});

test("timed layer trim/hold, lifecycle and sampling motion remain separate wrapper channels", () => {
  let layers = createMediaLayerSet();
  layers = appendTimedMediaLayer(layers, timed(), fit, sealMediaSampleLayerSpec({

    id: "video",
    trim: { startFrame: 10, endFrameExclusive: 40 },
    occupancy: { mode: "hold", align: "start" },
    appearance,
    samplingMotion: { keyframes: [
      { atProgress: 0, zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
      { atProgress: 0.5, zoom: 1.1, offsetX: 10, offsetY: -5, rotationDeg: 1 },
      { atProgress: 1, zoom: 1.2, offsetX: 20, offsetY: -10, rotationDeg: 2, easing: "ease-out" },
    ] },
  }));
  const program = finalizeMediaTrack(appendProgramMediaItem(createMediaTrackSet(), header, semantic, canvas, layers, frame, itemSpec({
    motion: {
      enter: { operator: "slide", durationFrames: 12, easing: "ease-out", direction: "down", amount: 120 },
      sustain: [{ operator: "wobble", amount: 2, cycles: 2 }],
      exit: { operator: "fade", durationFrames: 10, easing: "ease-in" },
    },
  }), createMediaSoundSet()), header, space);
  const elements = projectMediaVisualTrack(space, program).presents[0]!.elements;
  assert.ok(elements.find((element) => element.id.endsWith(":lifecycle"))?.animation);
  assert.ok(elements.find((element) => element.id.includes(":sustain:"))?.animation);
  const samplingWrapper = elements.find((element) => element.id === "video:sampling");
  assert.ok(samplingWrapper?.animation);
  assert.deepEqual(samplingWrapper?.animation?.keyframes.map((entry) => entry.atFrame), [0, 60, 120]);
  const video = elements.find((element) => element.id === "video");
  assert.equal(video?.kind, "video");
  assert.deepEqual(video.kind === "video" ? video.sampling?.segments : undefined, [
    { target: { startFrame: 0, endFrameExclusive: 30 }, sourceFrame: { numerator: 10, denominator: 1 }, rate: { numerator: 1, denominator: 1 } },
    { target: { startFrame: 30, endFrameExclusive: 120 }, sourceFrame: { numerator: 39, denominator: 1 }, rate: { numerator: 0, denominator: 1 } },
  ]);
  const overlapping = lifecycleAnimation({
    enter: { operator: "fade", durationFrames: 70, easing: "linear" },
    sustain: [],
    exit: { operator: "fade", durationFrames: 60, easing: "linear" },
  }, 120)!;
  const overlapFrame = overlapping.keyframes.find((keyframe) => keyframe.atFrame === 65)!;
  const overlapOpacity = overlapFrame.style.find((declaration) => declaration.name === "opacity")?.value;
  assert.equal(typeof overlapOpacity, "number");
  assert.ok((overlapOpacity as number) > 0 && (overlapOpacity as number) < 1);
});

test("source audio and edge SFX project separately from the visual Track", () => {
  let layers = createMediaLayerSet();
  layers = appendTimedMediaLayer(layers, timed("audio"), fit, sealMediaSampleLayerSpec({

    id: "video",
    trim: { startFrame: 10, endFrameExclusive: 40 },
    occupancy: { mode: "hold", align: "end" },
    appearance,
  }));
  let sounds = createMediaSoundSet();
  sounds = appendMediaSound(sounds, timed("sfx-enter"), sealMediaSoundSpec({
    id: "enter-sound", trigger: { kind: "enter" }, gain: 0.5,
  }));
  sounds = appendMediaSound(sounds, timed("sfx-exit"), sealMediaSoundSpec({
    id: "exit-sound", trigger: { kind: "exit" }, gain: 0.25,
  }));
  const program = finalizeMediaTrack(appendProgramMediaItem(createMediaTrackSet(), header, semantic, canvas, layers, frame, itemSpec({
    sourceAudio: { fromLayer: "video", gain: 0.75 },
    motion: { sustain: [], exit: { operator: "fade", durationFrames: 10, easing: "ease-in" } },
  }), sounds), header, space);
  const visual = projectMediaVisualTrack(space, program);
  const audio = projectMediaAudioTrack(space, program);
  assert.equal(visual.presents.length, 1);
  assert.equal(audio.clips.length, 3);
  const sourceClip = audio.clips.find((clip) => clip.id.endsWith(":source-audio"));
  assert.deepEqual(sourceClip?.target, { startSample: 144_000, endSampleExclusive: 192_000 });
  assert.deepEqual(sourceClip?.source, {
    sampleFrames: 96_000,
    startSample: 16_000,
    endSampleExclusive: 64_000,
    loop: false,
    phaseSample: 0,
  });
  assert.equal(sourceClip?.gain, 0.75);
  assert.throws(() => projectMediaAudioTrack(space, finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, stillLayers(), frame, itemSpec(), createMediaSoundSet(),
  ), header, space)), /no explicitly authored audio/u);

  const bgm: AudioTrack = {
    kind: "audio",
    id: "independent-bgm",
    clips: [{
      id: "bed",
      artifact: timed("bgm").audio!.artifact,
      target: { startSample: 0, endSampleExclusive: 192_000 },
      source: {
        sampleFrames: 96_000,
        startSample: 0,
        endSampleExclusive: 96_000,
        loop: true,
        phaseSample: 0,
      },
      playbackRate: 1,
      pitch: "preserve",
      gain: 0.2,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    }],
  };
  const composition = sealComposition({
    id: "media-with-peer-bgm",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [visual, audio, bgm],
  });
  assert.deepEqual(composition.tracks.find((candidate) => candidate.id === bgm.id), bgm,
    "Media visual/audio projection must not rewrite an independent peer BGM Track");
});

test("still and animated typed Surfaces use the same layer law without browser format guesses", () => {
  const still: CompositableSurfaceRef = {
    artifact: { kind: "blob", digest: fixtureDigest("surface:still"), size: 500, mediaType: "image/png" },
    width: 100,
    height: 100,
    colorSpace: "srgb",
    alphaMode: "straight",
    timing: { kind: "still" },
  };
  const animated: CompositableSurfaceRef = {
    ...still,
    artifact: { kind: "blob", digest: fixtureDigest("surface:animated"), size: 2_000, mediaType: "video/webm" },
    timing: { kind: "frames", frameRate: { numerator: 30, denominator: 1 }, frameCount: 30 },
  };
  let layers = appendSurfaceMediaLayer(createMediaLayerSet(), still, fit, sealMediaSampleLayerSpec({
    id: "still", appearance,
  }));
  layers = appendSurfaceMediaLayer(layers, animated, fit, sealMediaSampleLayerSpec({
    id: "animated", occupancy: { mode: "loop", align: "start" }, appearance,
  }));
  const elements = projectMediaVisualTrack(space, finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, layers, frame, itemSpec(), createMediaSoundSet(),
  ), header, space)).presents[0]!.elements;
  assert.equal(elements.find((element) => element.id === "still")?.kind, "surface");
  const moving = elements.find((element) => element.id === "animated");
  assert.equal(moving?.kind, "surface");
  assert.ok(moving?.kind === "surface" && moving.sampling !== undefined);
  const defaulted = appendSurfaceMediaLayer(createMediaLayerSet(), animated, fit, sealMediaSampleLayerSpec({
    id: "defaulted", appearance,
  }));
  assert.deepEqual(defaulted.layers[0]?.kind === "sample" ? defaulted.layers[0].occupancy : undefined,
    { mode: "once", align: "start" });
});

test("Media Items consume singular Selection and Moment sources without becoming an exclusive lane", () => {
  const selection: NarrativeSelectionRef = {
    id: "mentions",
    startAnchorId: "a",
    endAnchorId: "b",
  };
  const selected = appendSelectionMediaItem(createMediaTrackSet(), header, semantic, canvas, stillLayers(), frame,
    selection, itemSpec({
      id: "mention",
      projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
    }), createMediaSoundSet());
  assert.deepEqual(selected.items.map((item) => item.span), [{ startFrame: 15, endFrameExclusive: 45 }]);
  const moment: NarrativeMomentRef = {
    id: "cue", anchorId: "b",
  };
  const overlapping = appendMomentMediaItem(selected, header, semantic, canvas, stillLayers(), frame,
    moment, itemSpec({
      id: "popup",
      projection: { start: { ref: "moment.cue", offset: { unit: "frames", value: -10 } }, end: { ref: "moment.cue", offset: { unit: "frames", value: 20 } } },
      stackingOrder: 41,
    }), createMediaSoundSet());
  assert.deepEqual(overlapping.items[1]?.span, { startFrame: 35, endFrameExclusive: 65 });
  const track = projectMediaVisualTrack(space, finalizeMediaTrack(overlapping, header, space));
  assert.deepEqual(track.presents.map((present) => present.stacking.order), [40, 41]);

  const absolute = appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, stillLayers(), frame,
    itemSpec({
      id: "absolute",
      projection: {
        start: { ref: "absolute", at: { unit: "frames", value: 7 } },
        end: { ref: "absolute", at: { unit: "frames", value: 19 } },
      },
    }), createMediaSoundSet(),
  );
  assert.deepEqual(absolute.items[0]?.span, { startFrame: 7, endFrameExclusive: 19 });
});

test("a Media Item can consume one whole Narrative Segment without a synthetic Selection", () => {
  const result = appendSegmentMediaItem(
    createMediaTrackSet(), header, semantic, canvas, stillLayers(), frame,
    { kind: "segment", id: "answer", tokenStart: 0, tokenEndExclusive: 1 },
    itemSpec({
      id: "whole-answer",
      projection: { start: { ref: "segment.start" }, end: { ref: "segment.end" } },
    }),
    createMediaSoundSet(),
  );
  assert.deepEqual(result.items.map((item) => item.span), [{ startFrame: 30, endFrameExclusive: 90 }]);
});

test("every declared lifecycle and sustain operator lowers, and outside-canvas motion resolves from explicit geometry", () => {
  for (const operator of ["fade", "slide", "scale", "pop", "bounce", "blur-reveal", "wipe", "flip", "spin"] as const) {
    const direction = ["slide", "wipe", "flip"].includes(operator) ? { direction: "up" as const } : {};
    assert.ok(lifecycleAnimation({ enter: { operator, durationFrames: 10, easing: "ease-out", ...direction }, sustain: [] }, 30));
  }
  for (const operator of ["float", "breathe", "pulse", "wobble", "shake", "drift"] as const) {
    assert.ok(sustainAnimation({ operator, amount: 2, cycles: 2, ...(operator === "drift" ? { direction: "right" as const } : {}) }, 30));
  }
  const resolved = resolveMediaLifecycleMotion({
    enter: { operator: "slide", durationFrames: 8, easing: "ease-out", direction: "up", origin: "outside-canvas" },
    sustain: [],
    exit: { operator: "slide", durationFrames: 8, easing: "ease-in", direction: "down", origin: "outside-canvas" },
  }, frame, canvas);
  assert.deepEqual(resolved.enter, { operator: "slide", durationFrames: 8, easing: "ease-out", direction: "up", amount: 500 });
  assert.deepEqual(resolved.exit, { operator: "slide", durationFrames: 8, easing: "ease-in", direction: "down", amount: 1_720 });
});

test("every documented Media frame and fit remains one ordinary Item instead of a mode", () => {
  const frames = [
    { xPx: 0, yPx: 0, widthPx: 1080, heightPx: 1920 },
    { xPx: 0, yPx: 0, widthPx: 540, heightPx: 1920 },
    { xPx: 80, yPx: 1280, widthPx: 920, heightPx: 500 },
    { xPx: 760, yPx: 80, widthPx: 260, heightPx: 360 },
    { xPx: -120, yPx: 1400, widthPx: 500, heightPx: 600 },
  ];
  const sizings = ["contain", "cover", "fit-width", "fit-height", "native", "scale-down", "stretch"] as const;
  let set = createMediaTrackSet();
  for (const [index, sizing] of sizings.entries()) {
    const localFit = { ...fit, sizing,
      framePoint: { x: index % 2 === 0 ? 0.2 : 0.8, y: 0.75 },
      contentPoint: { x: 0.65, y: 0.1 },
      constraint: index % 2 === 0 ? "bounded" as const : "free" as const,
    };
    const layers = appendStillMediaLayer(createMediaLayerSet(), source,
      { widthPx: index % 3 === 0 ? 400 : index % 3 === 1 ? 1200 : 800,
        heightPx: index % 3 === 0 ? 1200 : index % 3 === 1 ? 400 : 800 },
      localFit, sealMediaSampleLayerSpec({ id: `sample-${index}`, appearance }));
    set = appendProgramMediaItem(set, header, semantic, canvas, layers, frames[index % frames.length]!, itemSpec({
      id: `fit-${sizing}`, stackingOrder: 100 + index,
      presentation: { clip: { kind: "none" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 }, shadows: [] },
    }), createMediaSoundSet());
  }
  const track = projectMediaVisualTrack(space, finalizeMediaTrack(set, header, space));
  assert.equal(track.presents.length, sizings.length);
  for (const present of track.presents) {
    const placement = present.elements[0]!;
    assert.equal(placement.kind, "box");
    assert.ok(placement.style.some((entry) => entry.name === "width" && typeof entry.value === "string"));
    assert.ok(placement.style.some((entry) => entry.name === "height" && typeof entry.value === "string"));
  }
});

test("transparent, Paint, self-blur and alternate-source backing are only ordered owned layers", () => {
  const alternate: BlobRef = { kind: "blob", digest: fixtureDigest("media-track:alternate"), size: 2_048, mediaType: "image/webp" };
  let layers = createMediaLayerSet();
  layers = appendMediaPaintLayer(layers, sealMediaPaintLayerSpec({
    id: "solid", paint: { kind: "solid", color: "#101018" }, opacity: 1,
  }));
  layers = appendStillMediaLayer(layers, source, extent, { ...fit, sizing: "cover" }, sealMediaSampleLayerSpec({
    id: "self-blur", appearance: {
      opacity: 1, filter: { blurPx: 32, brightness: 0.7, contrast: 1.1, saturation: 0.8 },
    },
  }));
  layers = appendStillMediaLayer(layers, alternate, { ...extent, widthPx: 1200, heightPx: 600 }, { ...fit, sizing: "cover" },
    sealMediaSampleLayerSpec({ id: "alternate", appearance }));
  layers = appendStillMediaLayer(layers, source, extent, fit,
    sealMediaSampleLayerSpec({ id: "foreground", appearance }));
  const track = projectMediaVisualTrack(space, finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, layers, frame, itemSpec(), createMediaSoundSet(),
  ), header, space));
  const document = compileHyperframesDocument(sealComposition({
    id: "layer-matrix", canvas: { width: 1080, height: 1920, clearColor: "#000000" }, tracks: [track],
  }), space);
  assert.deepEqual(track.presents[0]!.elements.filter((element) => element.kind === "image").map((element) => element.id),
    ["self-blur", "alternate", "foreground"]);
  assert.equal(document.artifacts.length, 2, "repeated samples share bytes while the alternate source remains explicit");

  const transparent = projectMediaVisualTrack(space, finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas,
    appendStillMediaLayer(createMediaLayerSet(), source, extent, fit,
      sealMediaSampleLayerSpec({ id: "only", appearance })),
    frame, itemSpec(), createMediaSoundSet(),
  ), header, space));
  assert.equal(transparent.presents[0]!.elements.some((element) =>
    element.kind === "box" && element.style.some((entry) => entry.name === "background")), false);
});

test("visual-only normalized video never creates an implicit audio branch", () => {
  const silent = timedLayers("silent", false);
  const program = finalizeMediaTrack(appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, silent, frame, itemSpec(), createMediaSoundSet(),
  ), header, space);
  assert.equal(projectMediaVisualTrack(space, program).presents[0]!.elements.some((element) => element.kind === "video"), true);
  assert.throws(() => projectMediaAudioTrack(space, program), /no explicitly authored audio projection/u);
  assert.throws(() => appendProgramMediaItem(
    createMediaTrackSet(), header, semantic, canvas, silent, frame,
    itemSpec({ sourceAudio: { fromLayer: "video", gain: 1 } }), createMediaSoundSet(),
  ), /has no normalized audio/u);
});

test("timed visual occupancy resolves every alignment into exact source-frame segments", () => {
  const sampling = (occupancy: Parameters<typeof resolveVisualSampling>[0]["occupancy"]) =>
    resolveVisualSampling({ space, sourceFrameRate: { numerator: 30, denominator: 1 }, sourceFrameCount: 30, targetFrameCount: 50, occupancy });
  assert.deepEqual(sampling({ mode: "once", align: "start" }).segments.map((item) => item.target), [{ startFrame: 0, endFrameExclusive: 30 }]);
  assert.deepEqual(sampling({ mode: "once", align: "end" }).segments.map((item) => item.target), [{ startFrame: 20, endFrameExclusive: 50 }]);
  assert.deepEqual(sampling({ mode: "loop", align: "end" }).segments[0]?.sourceFrame, { numerator: 10, denominator: 1 });
  assert.deepEqual(sampling({ mode: "stretch" }).segments[0]?.rate, { numerator: 3, denominator: 5 });
  assert.throws(() => resolveVisualSampling({
    space, sourceFrameRate: { numerator: 24, denominator: 1 }, sourceFrameCount: 24, targetFrameCount: 30,
    occupancy: { mode: "once", align: "start" },
  }), /normalized to ProgramSpace frame rate/u);
});

test("the graph keeps every source, extent, fit, frame, time and appearance input explicit", () => {
  assert.deepEqual(stillMediaTrackFragment.inputs.map((input) => input.name), [
    "canvas", "extent", "fit", "frame", "header", "item-spec", "sample-spec", "semantic", "source", "window-spec",
  ]);
});

test("the Media author Surface emits explicit graph edges for layers, semantic time, Sequence topology and sound", async () => {
  const range = { source: "media-surface.svml", start: 0, end: 1 };
  const ref = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
  const node = (name: string, attributes: Record<string, MarkupAttributeValue>, children: StructuredNode[] = []): StructuredElement => ({
    kind: "element", name, attributes, children, range,
  });
  const appearance = (path: string, properties: SvsRecipe["properties"]): SurfaceResolvedReference => ({
    path,
    ref: { kind: "record", id: path },
    type: svsRecipeType,
    record: { value: { kind: "inline", value: { path, properties } } } as never,
  });
  const plain = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference => ({
    path, ref: { kind: "record", id: path }, type,
  });
  const references = new Map<string, SurfaceResolvedReference>([
    ["canvas", plain("canvas", spatialTypes.canvas)],
    ["semantic", plain("semantic", semanticTrackTypes.track)],
    ["frame", plain("frame", spatialTypes.frame)],
    ["clip-path", plain("clip-path", spatialTypes.path)],
    ["still", plain("still", artifactTypes.blob)],
    ["extent", plain("extent", spatialTypes.extent)],
    ["video", plain("video", mediaTypes.synchronized)],
    ["surface", plain("surface", mediaTypes.compositableSurface)],
    ["sfx", plain("sfx", mediaTypes.synchronized)],
    ["selection", plain("selection", narrativeTypes.selection)],
    ["answer-segment", plain("answer-segment", narrativeTypes.excerpt)],
    ["terminal", plain("terminal", narrativeTypes.selection)],
    ["cue1", plain("cue1", narrativeTypes.moment)],
    ["cue2", plain("cue2", narrativeTypes.moment)],
    ["still-style", appearance("still-style", { "stack-order": 20, fit: "contain" })],
    ["card-style", appearance("card-style", { "stack-order": 30, clip: "frame", "frame-paint": "#111111" })],
    ["video-style", appearance("video-style", { fit: "cover", playback: "hold-start", opacity: 1 })],
    ["paint-style", appearance("paint-style", { paint: "linear(90;#111111@0,#333333@1)", opacity: 1 })],
    ["sequence-style", appearance("sequence-style", { "stack-order": 40, fit: "contain", clip: "frame" })],
    ["surface-style", appearance("surface-style", { fit: "cover", playback: "loop-start" })],
    ["motion", appearance("motion", { enter: "slide", "enter-frames": 12, "enter-easing": "ease-out", "enter-direction": "up", "enter-origin": "outside-canvas" })],
    ["handoff", appearance("handoff", { operator: "crossfade", "duration-frames": 10, "boundary-ratio": 0.5, audio: "cut" })],
  ]);
  const root = node("media:Track", { id: "editorial", semantic: ref("semantic"), canvas: ref("canvas") }, [
    node("media:Item", { id: "still-card", image: ref("still"), extent: ref("extent"), frame: ref("frame"), clip: ref("clip-path"), appearance: ref("still-style"), during: "program" }),
    node("media:Item", { id: "segment-card", image: ref("still"), extent: ref("extent"), frame: ref("frame"), appearance: ref("still-style"), during: ref("answer-segment") }),
    node("media:Item", { id: "proof", frame: ref("frame"), appearance: ref("card-style"), motion: ref("motion"), during: ref("selection"), "source-audio": "video", "audio-gain": "0.8" }, [
      node("media:Paint", { id: "backing", appearance: ref("paint-style") }),
      node("media:Layer", { id: "video", media: ref("video"), appearance: ref("video-style") }, [
        node("media:Sampling", { at: "start", zoom: "1" }),
        node("media:Sampling", { at: "end", zoom: "1.1", y: "-10", easing: "ease-out" }),
      ]),
      node("media:Sound", { id: "proof-enter", source: ref("sfx"), at: "enter", gain: "0.5" }),
    ]),
    node("media:Sequence", { id: "steps", frame: ref("frame"), appearance: ref("sequence-style"), until: ref("terminal"), "until-boundary": "end" }, [
      node("media:Member", { id: "one", image: ref("still"), extent: ref("extent"), at: ref("cue1") }),
      node("media:Member", { id: "two", surface: ref("surface"), appearance: ref("surface-style"), at: ref("cue2") }),
      node("media:Handoff", { id: "one-two", from: "one", transition: ref("handoff") }),
      node("media:Sound", { id: "transition", source: ref("sfx"), handoff: "one-two" }),
    ]),
  ]);
  const result = await decodeMediaTrackSurface({
    sourceName: "media-surface.svml",
    element: root,
    resolveReference: (path) => references.get(path),
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(result.components.length, 1);
  assert.deepEqual(Object.keys(result.components[0]!.outputs).sort(), ["audio", "program", "visual"]);
  const fragment = result.fragments[0]!;
  const producers = fragment.operations.map((entry) => entry.producer.name);
  assert.ok(producers.includes("append-still-media-layer"));
  assert.ok(producers.includes("append-media-item"));
  assert.ok(producers.includes("append-timed-media-layer"));
  assert.ok(producers.includes("append-surface-media-layer"));
  assert.ok(producers.includes("append-media-paint-layer"));
  assert.ok(producers.includes("bind-media-item-clip-path"));
  assert.ok(producers.includes("append-media-sequence-member"));
  assert.ok(producers.includes("append-media-sequence-until-selection-end"));
  assert.ok(producers.includes("append-media-sound"));
  assert.ok(fragment.inputs.some((entry) => entry.type.name === artifactTypes.blob.name));
  assert.ok(fragment.inputs.some((entry) => entry.type.name === mediaTypes.synchronized.name));
  assert.ok(fragment.inputs.some((entry) => entry.type.name === narrativeTypes.selection.name));
  assert.ok(fragment.inputs.some((entry) => entry.type.name === spatialTypes.path.name));
  const itemSpecs = result.records.filter((entry) => entry.type.name === "MediaItemSpec");
  assert.equal(itemSpecs.length, 3);
  const selected = itemSpecs[2]!.value.kind === "inline"
    ? itemSpecs[2]!.value.value as unknown as MediaItemSpec
    : undefined;
  assert.equal(selected?.sourceAudio?.fromLayer, "video");
  assert.ok(mediaTrackMarkupSurfaces.some((surface) => surface.name === "track"));
});

test("Sequence resolves strict logical phases, expanded handoffs and one uninterrupted outer lifecycle", () => {
  const set = appendMediaSequence(
    createMediaTrackSet(), header, space, canvas, sequenceMembers(), frame, sequenceSpec(), sequenceSounds(), 120,
  );
  const program = finalizeMediaTrack(set, header, space);
  const sequence = program.sequences[0]!;
  assert.deepEqual(sequence.members.map((member) => member.logicalSpan), [
    { startFrame: 0, endFrameExclusive: 40 },
    { startFrame: 40, endFrameExclusive: 80 },
    { startFrame: 80, endFrameExclusive: 120 },
  ]);
  assert.deepEqual(sequence.members.map((member) => member.visualSpan), [
    { startFrame: 0, endFrameExclusive: 50 },
    { startFrame: 30, endFrameExclusive: 90 },
    { startFrame: 70, endFrameExclusive: 120 },
  ]);
  assert.deepEqual(sequence.handoffs.map((handoff) => handoff.span), [
    { startFrame: 30, endFrameExclusive: 50 },
    { startFrame: 70, endFrameExclusive: 90 },
  ]);

  const presents = projectMediaVisualTrack(space, program).presents;
  assert.equal(presents.length, 3);
  const middleLifecycle = presents[1]!.elements.find((element) => element.id.endsWith(":lifecycle"));
  assert.deepEqual(middleLifecycle?.animation?.keyframes.map((keyframe) => keyframe.style.find((item) => item.name === "opacity")?.value), [1, 1],
    "the middle member observes the neutral slice of the outer lifecycle instead of restarting entry");
  const middleSustain = presents[1]!.elements.find((element) => element.id.includes(":sustain:"));
  assert.equal(middleSustain?.animation?.keyframes.length, 5,
    "the middle member keeps only its exact boundary and group-global phase rows");
  assert.equal(middleSustain?.animation?.keyframes[1]?.atFrame, 15,
    "the middle member resumes the next group-global phase boundary instead of starting a new cycle");
  assert.notEqual(middleSustain?.animation?.keyframes[1]?.style[0]?.value, "none");
  assert.ok(presents[1]!.elements.find((element) => element.id.endsWith(":handoff"))?.animation);
  const sampled = presents[1]!.elements.find((element) => element.id === "video");
  assert.equal(sampled?.kind, "video");
  assert.deepEqual(sampled.kind === "video" ? sampled.sampling?.segments[0]?.target : undefined,
    { startFrame: 0, endFrameExclusive: 60 });
});

test("Sequence handoffs accept still, timed and alpha Surface members through one lowering path", () => {
  const alphaSurface: CompositableSurfaceRef = {
    artifact: { kind: "blob", digest: fixtureDigest("surface:alpha-member"), size: 800, mediaType: "image/png" },
    width: 200, height: 300, colorSpace: "srgb", alphaMode: "straight", timing: { kind: "still" },
  };
  const surfaceLayers = () => appendSurfaceMediaLayer(createMediaLayerSet(), alphaSurface, fit, sealMediaSampleLayerSpec({
    id: "surface", appearance,
  }));
  for (const pair of [
    [stillLayers(), stillLayers()],
    [timedLayers("left"), timedLayers("right")],
    [stillLayers(), timedLayers("moving")],
    [surfaceLayers(), stillLayers()],
  ] as const) {
    let members = createMediaSequenceMemberSet();
    members = appendMediaSequenceMember(members, pair[0], sealMediaSequenceMemberSpec({ id: "a" }), 0);
    members = appendMediaSequenceMember(members, pair[1], sealMediaSequenceMemberSpec({ id: "b" }), 60);
    const spec = sequenceSpec({ motion: { sustain: [] }, handoffs: [sealMediaHandoffSpec({
      id: "a-b", fromMemberId: "a", toMemberId: "b",
      operator: "crossfade", durationFrames: 10, boundaryRatio: 0.5, audio: "cut",
    })] });
    const program = finalizeMediaTrack(appendMediaSequence(createMediaTrackSet(), header, space, canvas,
      members, frame, spec, createMediaSoundSet(), 120), header, space);
    assert.equal(projectMediaVisualTrack(space, program).presents.length, 2);
  }
});

test("Sequence projects source audio, visual-independent cut/crossfade, edge sounds and boundary sound", () => {
  const program = finalizeMediaTrack(appendMediaSequence(
    createMediaTrackSet(), header, space, canvas, sequenceMembers(), frame, sequenceSpec(), sequenceSounds(), 120,
  ), header, space);
  const track = projectMediaAudioTrack(space, program);
  const sources = track.clips.filter((clip) => clip.id.endsWith(":source-audio"));
  assert.equal(sources.length, 3);
  assert.deepEqual(sources.map((clip) => clip.target), [
    { startSample: 0, endSampleExclusive: 80_000 },
    { startSample: 48_000, endSampleExclusive: 128_000 },
    { startSample: 128_000, endSampleExclusive: 192_000 },
  ]);
  assert.deepEqual(sources.map((clip) => [clip.fadeInSamples, clip.fadeOutSamples]), [
    [0, 32_000], [32_000, 0], [0, 0],
  ]);
  assert.deepEqual(Object.fromEntries(track.clips.filter((clip) => !clip.id.endsWith(":source-audio"))
    .map((clip) => [clip.id, clip.target.startSample])), {
    "steps:enter-sound": 0,
    "steps:handoff-out-sound": 64_000,
    "steps:handoff-in-sound": 64_000,
    "steps:exit-sound": 176_000,
  });
});

test("every Sequence handoff operator and boundary ratio lowers without changing the authored boundary", () => {
  const operators: readonly MediaHandoffOperator[] = ["cut", "crossfade", "push", "wipe", "cover", "page-turn"];
  for (const operator of operators) {
    for (const boundaryRatio of [0, 0.5, 1]) {
      const durationFrames = operator === "cut" ? 0 : 20;
      const handoff = sealMediaHandoffSpec({

        id: `${operator}-${boundaryRatio}`,
        fromMemberId: "member-1",
        toMemberId: "member-2",
        operator,
        durationFrames,
        boundaryRatio,
        ...(["push", "wipe", "cover", "page-turn"].includes(operator) ? { direction: "right" as const } : {}),
        audio: "cut",
      });
      const spec = sequenceSpec({
        handoffs: [handoff],
        motion: { sustain: [] },
      });
      const program = finalizeMediaTrack(appendMediaSequence(
        createMediaTrackSet(), header, space, canvas, sequenceMembers([0, 60]), frame, spec, createMediaSoundSet(), 120,
      ), header, space);
      const resolved = program.sequences[0]!.handoffs[0]!;
      assert.equal(resolved.span.endFrameExclusive - resolved.span.startFrame, durationFrames);
      assert.equal(program.sequences[0]!.members[1]!.activationFrame, 60);
      assert.equal(projectMediaVisualTrack(space, program).presents.length, 2);
    }
  }

  for (const durationFrames of [20, 60, 80]) {
    const spec = sequenceSpec({
      motion: { sustain: [] },
      handoffs: [sealMediaHandoffSpec({

        id: `duration-${durationFrames}`,
        fromMemberId: "member-1",
        toMemberId: "member-2",
        operator: "crossfade",
        durationFrames,
        boundaryRatio: 0.5,
        audio: "crossfade",
      })],
    });
    const sequence = finalizeMediaTrack(appendMediaSequence(
      createMediaTrackSet(), header, space, canvas, sequenceMembers([0, 60]), frame,
      spec, createMediaSoundSet(), 120,
    ), header, space).sequences[0]!;
    assert.equal(sequence.handoffs[0]!.span.endFrameExclusive
      - sequence.handoffs[0]!.span.startFrame, durationFrames);
  }
});

test("Sequence fails atomically on malformed order, topology, envelope and three-member overlap", () => {
  assert.throws(() => appendMediaSequence(
    createMediaTrackSet(), header, space, canvas, sequenceMembers(), frame,
    sequenceSpec({ handoffs: sequenceSpec().handoffs.slice(0, 1) }), createMediaSoundSet(), 120,
  ), /exactly one Handoff/u);
  assert.throws(() => appendMediaSequence(
    createMediaTrackSet(), header, space, canvas, sequenceMembers([0, 40, 40]), frame, sequenceSpec(), createMediaSoundSet(), 120,
  ), /strictly increasing/u);
  assert.throws(() => appendMediaSequence(
    createMediaTrackSet(), header, space, canvas, sequenceMembers([0, 80, 40]), frame, sequenceSpec(), createMediaSoundSet(), 120,
  ), /authored order/u);
  assert.throws(() => appendMediaSequence(
    createMediaTrackSet(), header, space, canvas, sequenceMembers([0, 40, 70]), frame,
    sequenceSpec({ handoffs: [
      sealMediaHandoffSpec({ id: "wide-one", fromMemberId: "member-1", toMemberId: "member-2", operator: "crossfade", durationFrames: 40, boundaryRatio: 0.5, audio: "cut" }),
      sealMediaHandoffSpec({ id: "wide-two", fromMemberId: "member-2", toMemberId: "member-3", operator: "crossfade", durationFrames: 40, boundaryRatio: 0.5, audio: "cut" }),
    ] }), createMediaSoundSet(), 120,
  ), /overlapping Handoffs/u);
  assert.throws(() => appendMediaSequence(
    createMediaTrackSet(), header, space, canvas, sequenceMembers([0, 20]), frame,
    sequenceSpec({ handoffs: [
      sealMediaHandoffSpec({ id: "outside", fromMemberId: "member-1", toMemberId: "member-2", operator: "wipe", durationFrames: 60, boundaryRatio: 1, direction: "left", audio: "cut" }),
    ] }), createMediaSoundSet(), 120,
  ), /envelope/u);
});
