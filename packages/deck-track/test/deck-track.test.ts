import assert from "node:assert/strict";
import test from "node:test";
import { videoContractManifests } from "../../../test/support/video-domain.js";
import { fixtureDigest } from "../../../test/fixture-digest.js";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";

import { compositionDependency, compositionTypes } from "@hypit/composition";
import type { VisualElement, VisualTimedSampling } from "@hypit/composition";
import { createResolvedClosure } from "@hypit/core";
import {
  decodeDepthStackLabelSurface,
  decodeDepthStackSurface,
  appendDepthStackCard,
  createDepthStackCardSet,
  decodeDepthStackSpec,
  depthStackManifest,
  depthStackMarkupSurfaces,
  depthStackProducers,
  depthStackTypes,
  finalizeDepthStack,
  noDepthStackCardLabel,
  renderDepthStack,
  resolveDepthStackPose,
  resolveDepthStackState,
  sealDepthStackCardLabel,
  sealDepthStackCardSpec,
  sealDepthStackHeader,
  sealDepthStackSpec,
} from "@hypit/deck-track";
import type {
  DepthStackCardLabel,
  DepthStackProgram,
  DepthStackSpec,
} from "@hypit/deck-track";
import type { FontArtifactRef } from "@hypit/media";
import { mediaTypes } from "@hypit/media";
import { mediaPipelineManifest } from "@hypit/media-pipeline";
import type { MediaLayerSet } from "@hypit/media-track";
import { narrativeTypes } from "@hypit/narrative";
import { sealProgramSpace } from "@hypit/program-space";
import type { ModuleManifest } from "@hypit/protocol";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { sealCanvasSpace, sealSpatialFrame, spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import { sealText, textManifest, textTypes } from "@hypit/text";
import type { SvsRecipe } from "@hypit/svs";
import type {
  StructuredElement,
  StructuredNode,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";
import { artifactTypes } from "@hypit/artifact";
import { mediaTrackManifest, mediaTrackTypes } from "@hypit/media-track";

const space = sealProgramSpace({
  durationSec: 2,
  frameRate: { numerator: 30, denominator: 1 },
});
const semantic = semanticTrackFixture(space);
const canvas = sealCanvasSpace({
  widthPx: 360,
  heightPx: 640,
  origin: "top-left",
  xDirection: "right",
  yDirection: "down",
  pixelAspect: "square",
});
const frame = sealSpatialFrame({
  xPx: 60,
  yPx: 220,
  widthPx: 240,
  heightPx: 180,
});

const image = (name: string) => ({
  kind: "blob" as const,
  digest: fixtureDigest(`deck-image:${name}`),
  size: 16,
  mediaType: "image/png",
});
const video = (name: string) => ({
  kind: "blob" as const,
  digest: fixtureDigest(`deck-video:${name}`),
  size: 32,
  mediaType: "video/mp4",
});

test("DepthStack Surface declares every sealed Record it may emit", () => {
  const surface = depthStackMarkupSurfaces.find((item) => item.name === "track");
  assert.ok(surface !== undefined);
  const names = new Set(surface.outputs.map((type) => type.name));
  for (const type of [
    depthStackTypes.header,
    depthStackTypes.spec,
    depthStackTypes.cardSpec,
    spatialTypes.fit,
    mediaTrackTypes.sampleLayerSpec,
    mediaTrackTypes.paintLayerSpec,
    depthStackTypes.cardLabel,
    depthStackTypes.cardLabelStyle,
    textTypes.text,
    depthStackTypes.program,
    compositionTypes.visualTrack,
  ]) {
    assert.ok(names.has(type.name), `${type.name} output`);
  }
});

function stillMaterial(name: string): MediaLayerSet {
  return {

    layers: [{
      id: `${name}:sample`,
      kind: "sample",
      source: {
        kind: "still",
        artifact: image(name),
        extent: { widthPx: 120, heightPx: 90 },
      },
      fit: {
        sizing: "cover",
        framePoint: { x: 0.5, y: 0.5 },
        contentPoint: { x: 0.5, y: 0.5 },
        offsetPx: { x: 0, y: 0 },
        constraint: "bounded",
      },
      appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
    }],
  };
}

function timedMaterial(name: string, occupancy: "loop" | "hold" = "loop"): MediaLayerSet {
  return {

    layers: [{
      id: `${name}:sample`,
      kind: "sample",
      source: {
        kind: "timed",
        artifact: video(name),
        extent: { widthPx: 120, heightPx: 90 },
        frameRate: { numerator: 30, denominator: 1 },
        frameCount: 12,
      },
      fit: {
        sizing: "contain",
        framePoint: { x: 0.5, y: 0.5 },
        contentPoint: { x: 0.5, y: 0.5 },
        offsetPx: { x: 0, y: 0 },
        constraint: "bounded",
      },
      occupancy: { mode: occupancy, align: "start" },
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
    presentation: {
      clip: { kind: "rounded", radiusPx: 18 },
      padding: { topPx: 8, rightPx: 8, bottomPx: 8, leftPx: 8 },
      border: { widthPx: 2, style: "solid", color: "#ffffff" },
      shadows: [{ offsetX: 0, offsetY: 6, blurPx: 14, spreadPx: 0, color: "#00000088" }],
    },
    motion: {
      enter: { operator: "fade", durationFrames: 2, easing: "linear" },
      sustain: [{ operator: "float", amount: 2, cycles: 1 }],
      exit: { operator: "fade", durationFrames: 2, easing: "linear" },
    },
    stackingOrder: 30,
    ...input,
  });
}

function cardSpec(id: string, past: "hold-tail" | "continue" | "hide" = "hold-tail", future: "hold-head" | "continue" = "hold-head") {
  return sealDepthStackCardSpec({

    id,
    playback: { future, past },
  });
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
      input.materials?.[index] ?? stillMaterial(id),
      input.labels?.[index] ?? noDepthStackCardLabel(),
      input.playbacks?.[index] ?? cardSpec(id),
      trigger,
    );
  }
  return finalizeDepthStack(
    set,
    sealDepthStackHeader({ id: "proof-stack" }),
    frame,
    input.spec ?? baseSpec(),
    input.terminal ?? 60,
    semantic,
  );
}

function element(track: ReturnType<typeof renderDepthStack>, presentId: string, predicate: (value: VisualElement) => boolean): VisualElement {
  const value = track.presents.find((present) => present.id === presentId)?.elements.find(predicate);
  assert(value !== undefined, `${presentId} element is missing`);
  return value;
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
    frame, baseSpec(), 60, semantic,
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
  const animated = renderDepthStack(canvas, space, program());
  const stageTwo = animated.presents.filter((present) => present.span.startFrame === 20);
  assert.deepEqual(stageTwo.map((present) => present.id).sort(), [
    "card-1:stage:2", "card-2:stage:2", "card-3:stage:2",
  ]);
  for (const present of stageTwo) {
    const pose = present.elements.find((value) => value.id === "deck-pose");
    assert.deepEqual(pose?.animation?.keyframes.map((value) => value.atFrame), [0, 4, 20]);
    assert.ok(present.elements.some((value) => value.id === "deck-lifecycle"));
    assert.ok(present.elements.some((value) => value.id === "deck-sustain-1"));
  }
  const cut = renderDepthStack(canvas, space, program({
    spec: baseSpec({ reflow: { durationFrames: 0, easing: "linear" } }),
  }));
  assert.equal(cut.presents.filter((present) => present.span.startFrame === 20).length, 3);
  assert.ok(cut.presents.filter((present) => present.span.startFrame === 20)
    .every((present) => present.elements.find((value) => value.id === "deck-pose")?.animation === undefined));
});

test("timed Cards hold future head/current clock/past tail without renderer playback history", () => {
  const value = program({
    materials: [stillMaterial("one"), timedMaterial("two"), stillMaterial("three")],
  });
  const track = renderDepthStack(canvas, space, value);
  const future = element(track, "card-2:stage:1", (value) => value.kind === "video");
  const current = element(track, "card-2:stage:2", (value) => value.kind === "video");
  const past = element(track, "card-2:stage:3", (value) => value.kind === "video");
  assert.equal(future.kind, "video");
  assert.equal(current.kind, "video");
  assert.equal(past.kind, "video");
  assert.equal((future.sampling as VisualTimedSampling).segments[0]?.rate.numerator, 0);
  assert.deepEqual((current.sampling as VisualTimedSampling).segments[0]?.loop, { startFrame: 0, endFrameExclusive: 12 });
  assert.equal((past.sampling as VisualTimedSampling).segments[0]?.sourceFrame.numerator, 11);
  assert.equal((past.sampling as VisualTimedSampling).segments[0]?.rate.numerator, 0);
});

test("continue uses one explicit loop-start clock and past hide removes the retained state", () => {
  const continued = renderDepthStack(canvas, space, program({
    materials: [timedMaterial("one"), timedMaterial("two"), stillMaterial("three")],
    playbacks: [cardSpec("card-1", "continue"), cardSpec("card-2", "hold-tail", "continue"), cardSpec("card-3")],
  }));
  const future = element(continued, "card-2:stage:1", (value) => value.kind === "video");
  const past = element(continued, "card-1:stage:2", (value) => value.kind === "video");
  assert.equal(future.kind, "video");
  assert.equal(past.kind, "video");
  assert(future.sampling !== undefined);
  assert(past.sampling !== undefined);
  assert.deepEqual(future.sampling.segments[0]?.loop, { startFrame: 0, endFrameExclusive: 12 });
  assert.deepEqual(past.sampling.segments[0]?.loop, { startFrame: 0, endFrameExclusive: 12 });
  assert.throws(() => renderDepthStack(canvas, space, program({
    materials: [timedMaterial("one", "hold"), stillMaterial("two"), stillMaterial("three")],
    playbacks: [cardSpec("card-1", "continue"), cardSpec("card-2"), cardSpec("card-3")],
  })), /continue playback requires loop-start/u);
  const hidden = program({ playbacks: [cardSpec("card-1", "hide"), cardSpec("card-2"), cardSpec("card-3")] });
  assert.equal(resolveDepthStackState(hidden, 1).has(0), false);
});

const font: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", digest: fixtureDigest("deck-font"), size: 64, mediaType: "font/woff2" } }],
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
  const track = renderDepthStack(canvas, space, program({ labels: [exactLabel(), noDepthStackCardLabel(), noDepthStackCardLabel()] }));
  const label = element(track, "card-1:stage:1", (value) => value.kind === "text-flow");
  assert.equal(label.kind, "text-flow");
  assert.equal(label.parent, "deck-material:frame");
  assert.equal(label.typography.fonts?.[0]?.sources[0]?.artifact.digest, font.sources[0]!.artifact.digest);
  const authored = exactLabel();
  assert.equal(authored.kind, "text");
  assert.throws(() => sealDepthStackCardLabel({
    ...authored,
    typography: { ...authored.typography, fonts: undefined },
  } as unknown as DepthStackCardLabel), /exact font/u);
});

test("rendering is a pure absolute-frame result", () => {
  const value = program({ labels: [exactLabel(), noDepthStackCardLabel(), noDepthStackCardLabel()] });
  assert.deepEqual(renderDepthStack(canvas, space, value), renderDepthStack(canvas, space, structuredClone(value)));
});

test("the author Surface keeps every source, trigger, terminal, Frame and optional label as graph inputs", async () => {
  const range = { source: "deck.svml", start: 0, end: 1 };
  const ref = (path: string): MarkupAttributeValue => ({ kind: "reference", path });
  const node = (name: string, attributes: Record<string, MarkupAttributeValue>, children: StructuredNode[] = []): StructuredElement => ({ kind: "element", name, attributes, children, range });
  const plain = (path: string, type: SurfaceResolvedReference["type"]): SurfaceResolvedReference => ({ path, ref: { kind: "record", id: path }, type });
  const appearance = (path: string, properties: SvsRecipe["properties"]): SurfaceResolvedReference => ({
    path, ref: { kind: "record", id: path }, type: svsRecipeType,
    record: { value: { kind: "inline", value: { path, properties } } } as never,
  });
  const references = new Map<string, SurfaceResolvedReference>([
    ["semantic", plain("semantic", semanticTrackTypes.track)],
    ["canvas", plain("canvas", spatialTypes.canvas)], ["frame", plain("frame", spatialTypes.frame)],
    ["first", plain("first", artifactTypes.blob)], ["first-extent", plain("first-extent", spatialTypes.extent)],
    ["second", plain("second", mediaTypes.synchronized)], ["one", plain("one", narrativeTypes.moment)],
    ["two", plain("two", narrativeTypes.moment)], ["terminal", plain("terminal", narrativeTypes.selection)],
    ["deck-style", appearance("deck-style", { "visible-previous": 1, "visible-next": 1, "reflow-frames": 4, fit: "cover", "stack-order": 30 })],
    ["video-style", appearance("video-style", { fit: "contain", playback: "loop-start", "playback-future": "continue" })],
  ]);
  const result = await decodeDepthStackSurface({
    sourceName: "deck.svml",
    element: node("deck:DepthStack", {
      id: "proof", semantic: ref("semantic"), canvas: ref("canvas"), frame: ref("frame"),
      appearance: ref("deck-style"), until: ref("terminal"),
    }, [
      node("deck:Card", { id: "one", source: ref("first"), extent: ref("first-extent"), at: ref("one") }),
      node("deck:Card", { id: "two", source: ref("second"), at: ref("two"), appearance: ref("video-style") }),
    ]),
    resolveReference: (path) => references.get(path),
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(result.components.length, 1);
  assert.deepEqual(Object.keys(result.components[0]!.outputs).sort(), ["program", "track"]);
  const fragment = result.fragments[0]!;
  assert.ok(fragment.operations.some((operation) => operation.producer.name === "append-still-media-layer"));
  assert.ok(fragment.operations.some((operation) => operation.producer.name === "append-timed-media-layer"));
  assert.ok(fragment.operations.some((operation) => operation.producer.name === "append-depth-stack-moment-card"));
  assert.ok(fragment.operations.some((operation) => operation.producer.name === "finalize-depth-stack-until-selection-end"));
  assert.equal(fragment.inputs.filter((input) => input.type.name === narrativeTypes.moment.name).length, 2);
  assert.ok(fragment.inputs.some((input) => input.name === "frame"));
  assert.ok(fragment.inputs.some((input) => input.name === "terminal"));
});

test("Label Surface compiles explicit exact-font text rather than media metadata", async () => {
  const range = { source: "deck.svml", start: 0, end: 1 };
  const stack = { faces: [font] };
  const result = await decodeDepthStackLabelSurface({
    sourceName: "deck.svml",
    element: {
      kind: "element", name: "deck:Label", attributes: {
        id: "proof-label", font: { kind: "reference", path: "font" }, size: "28", color: "#ffeecc",
      }, children: [{ kind: "text", value: "Evidence", range }], range,
    },
    resolveReference: (path) => path === "font" ? {
      path, ref: { kind: "record", id: path }, type: mediaTypes.fontStack,
      record: { value: { kind: "inline", value: stack } } as never,
    } : undefined,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0]?.outputs.label, "proof-label");
  assert.equal(result.fragments[0]?.operations[0]?.producer.name, depthStackProducers.bindLabelText.name);
  assert.ok(result.records.some((record) => record.type.name === depthStackTypes.cardLabelStyle.name));
  assert.ok(result.records.some((record) => record.type.module.name === "@hypit/text" && record.type.name === "Text"));
});

test("Label Surface accepts ordinary graph Text without copying it during author compilation", async () => {
  const range = { source: "deck.svml", start: 0, end: 1 };
  const stack = { faces: [font] };
  const result = await decodeDepthStackLabelSurface({
    sourceName: "deck.svml",
    element: {
      kind: "element", name: "deck:Label", attributes: {
        id: "dynamic-label", font: { kind: "reference", path: "font" }, content: { kind: "reference", path: "copy" },
      }, children: [], range,
    },
    resolveReference: (path) => path === "font" ? {
      path, ref: { kind: "record", id: path }, type: mediaTypes.fontStack,
      record: { value: { kind: "inline", value: stack } } as never,
    } : path === "copy" ? {
      path, ref: { kind: "record", id: path }, type: textTypes.text,
      record: { value: { kind: "inline", value: sealText("Dynamic evidence") } } as never,
    } : undefined,
    resolveAsset: async () => { throw new Error("no asset resolution expected"); },
  });
  assert.deepEqual(result.components[0]?.inputs.content, { kind: "record", id: "copy" });
  assert.equal(result.records.some((record) => record.type.name === textTypes.text.name), false);
});

test("another Deck family can coexist by contributing only the existing VisualTrack waist", () => {
  const other: ModuleManifest = {
    format: "hypit.module@1" as const,
    name: "example.carousel",
    version: "1",
    dependencies: [compositionDependency],
    types: [], capabilities: [], producers: [{
      name: "render-carousel",
      inputs: [],
      outputs: [{ name: "track", type: compositionTypes.visualTrack }],
      needs: [],
    }],
  };
  const closure = createResolvedClosure([
    ...videoContractManifests,
    mediaPipelineManifest,
    mediaTrackManifest,
    textManifest,
    depthStackManifest,
    other,
  ]);
  assert.ok(closure.modules.some((module) => module.manifest.name === "@hypit/deck-track"));
  assert.ok(closure.modules.some((module) => module.manifest.name === "example.carousel"));
  assert.deepEqual(other.producers[0]?.outputs[0]?.type, compositionTypes.visualTrack);
});

test("SVS decoding exposes all documented depth, frame, motion and playback axes", () => {
  const value = decodeDepthStackSpec({

    path: "recipes.deck.proof",
    properties: {
      "visible-previous": 3, "visible-next": 2, wrap: false,
      "previous-y-step": 24, "previous-scale-step": 0.93, "previous-rotation-mode": "alternate",
      "next-y-step": -18, "next-opacity-step": 0.7, "reflow-frames": 6, "reflow-easing": "ease-out",
      clip: "rounded", radius: 16, padding: "8 12", "border-width": 2, "border-color": "#ffffff",
      enter: "fade", "enter-frames": 3, exit: "fade", "exit-frames": 3, "stack-order": 44,
    },
  });
  assert.deepEqual(value.visibility, { previous: 3, next: 2, wrap: false });
  assert.equal(value.poses.previous.yPerDepthPx, 24);
  assert.equal(value.reflow.durationFrames, 6);
  assert.equal(value.presentation.clip.kind, "rounded");
  assert.equal(value.motion.enter?.durationFrames, 3);
  assert.equal(value.stackingOrder, 44);
});
