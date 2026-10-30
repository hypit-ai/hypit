import { blobManifest } from "@hypit/blob";
import { sealTimeline, timelineManifest, timelineTypes } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { registerTypeRefinements } from "@hypit/refinement";
import { audioGraphFromClips, compositionComponent, compositionManifest, compositionTypes, sealAudioTrack, sealPresentVisualTrack, sealVisualTrack } from "@hypit/composition";
import type { Composition, Track } from "@hypit/composition";
import { mediaManifest } from "@hypit/media";
import type { FontArtifactRef } from "@hypit/media";
import { sealCanvas, spatialComponent, spatialManifest, spatialTypes } from "@hypit/spatial";
import { recipeManifest } from "@hypit/recipe";
import { htmlVisualElement } from "@hypit/html-program";
import { temporalManifest } from "@hypit/temporal";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { timelineFixture } from "../../../test/timeline-fixture.js";

import {
  createResolvedClosure,
  defineBuild,
  link,
  materializeBuild,
  planBuild,
  sealAuthorGraph,
} from "@hypit/kernel";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
} from "@hypit/author";
import { appendFilmAudioTrack, appendFilmVisualTrack, compileFilmComposition, createFilmAssemblyFragment, createFilmTrackSet, filmManifest, filmProducers, filmTypes, sealFilmProgram } from "@hypit/film";
import { compileHtmlProgram, htmlProgramFragment, htmlProgramManifest, htmlProgramProducers } from "@hypit/html-program";
import type { AuthorGraph, CanonicalValue, Value } from "@hypit/protocol";
import { renderFineTextOccurrence, stillTextMotion } from "@hypit/text-fine";
import type { TextStyle } from "@hypit/text-fine";
import { refineRecord, RefinementRegistry } from "@hypit/refinement";

const space = sealTimeline({ id: "test-space", frameCount: 120, frameRate: { numerator: 30, denominator: 1 },
});
const semantic = timelineFixture(space);

function validatorRegistry(): RefinementRegistry {
  const registry = new RefinementRegistry();
  registerTypeRefinements(registry, compositionComponent.refinements);
  registerTypeRefinements(registry, spatialComponent.refinements);
  return registry;
}
const canvas = sealCanvas({
  widthPx: 1080,
  heightPx: 1920,
});
const filmProgram = sealFilmProgram({
  id: "main-film",
  clearColor: "#000000", visual: { members: [
    { kind: "track", id: "background", slot: 1 },
    { kind: "track", id: "title", slot: 0 },
  ] },
  audio: [2],
});
const titleFont: FontArtifactRef = {
  sources: [{ artifact: {
    kind: "blob", resource: fixtureResource("film-test-title-font"), size: 1, mediaType: "font/woff2",
  } }],
  weight: 800,
  style: "normal",
};
const titleStyle: TextStyle = {

  id: "title-style",
  typography: {
    fonts: [titleFont], sizePx: 56, weight: 800, style: "normal",
    axes: [], features: [], synthesis: "none", kerning: "auto", trackingPx: 0,
    wordSpacingPx: 0, lineHeight: 1.2, direction: "auto", writingMode: "horizontal-tb",
    baselineShiftPx: 0, tabSize: 4, indentationPx: 0, paragraphBeforePx: 0,
    paragraphAfterPx: 0, transform: "none", variantCaps: "normal", verticalAlign: "baseline", decorations: [],
    cjk: { textSpacing: "normal", punctuationTrim: "none" },
  },
  paints: [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }],
};
const titleVisual = renderFineTextOccurrence(space, {
    timelineId: space.id,
    id: "title",
    span: { startFrame: 10, endFrameExclusive: 100 },
    placement: {
      kind: "flow", frame: { xPx: 86.4, yPx: 192, widthPx: 907.2, heightPx: 384 },
      flow: {
        inlineSize: "fixed", blockSize: "fixed",
        paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
        inlineAlign: "center", blockAlign: "center", wrap: "word", overflow: "visible",
        clipToFrame: false, columns: 1, columnGapPx: 0, metricEdge: "line-box",
      },
    },
    document: { paragraphs: [{ id: "title", inlines: [{ kind: "text", id: "title-text", text: "Semantic Video Markup Language" }] }] },
    style: titleStyle,
    motion: stillTextMotion(),
});
const background = sealPresentVisualTrack({ timelineId: "test-space",

  id: "background-track",
  presents: [{
    id: "background",
    span: { startFrame: 0, endFrameExclusive: 120 },
    root: htmlVisualElement({ id: "root", kind: "box", children: [], style: [{ name: "background-color", value: "#223344" }] }),
  }],
});
const audio = sealAudioTrack({ timelineId: "test-space",
  id: "empty-audio-track",
  graph: audioGraphFromClips([]),
});

function stored(value: CanonicalValue): Value {
  return value;
}

const closure = createResolvedClosure([
  blobManifest,
  timelineManifest,
  temporalManifest,
  mediaManifest,
  spatialManifest,
  compositionManifest,
  recipeManifest,
  htmlProgramManifest,
  filmManifest,
]);
const records = await Promise.all([
  { id: "timeline", type: timelineTypes.timeline, value: stored(space) },
  { id: "semantic", type: timelineTypes.timeline, value: stored(semantic) },
  { id: "canvas", type: spatialTypes.canvas, value: stored(canvas) },
  { id: "film-program", type: filmTypes.program, value: stored(filmProgram) },
  { id: "title", type: compositionTypes.visualTrack, value: stored(titleVisual) },
  { id: "background", type: compositionTypes.visualTrack, value: stored(background) },
  { id: "audio", type: compositionTypes.audioTrack, value: stored(audio) },
].map(async (record) => {
  await refineRecord(record, validatorRegistry());
  return record;
}));
const linked = link(closure, records);

const filmFragment = createFilmAssemblyFragment({
  name: "example/main-film",
  tracks: [
    { name: "title", kind: "visual" },
    { name: "background", kind: "visual" },
    { name: "audio", kind: "audio" },
  ],
});
const filmInstance = elaborateGraphFragment(linked, filmFragment, {
  id: "main-film",
  inputs: {
    program: { kind: "record", id: "film-program" },
    canvas: { kind: "record", id: "canvas" },
    timeline: { kind: "record", id: "timeline" },
    title: { kind: "record", id: "title" },
    background: { kind: "record", id: "background" },
    audio: { kind: "record", id: "audio" },
  },
});
const filmContribution = bindAuthorFragment(filmInstance, {
  composition: "main.composition",
});
const htmlProgramInstance = elaborateGraphFragment(linked, htmlProgramFragment, {
  id: "main-render",
  inputs: {
    composition: { kind: "logical-output", id: "main.composition" },
  },
});
const htmlProgramContribution = bindAuthorFragment(htmlProgramInstance, {
  program: "main.program",
});
const merged = mergeFragmentContributions(
  { outputs: [], operations: [] },
  filmContribution,
  htmlProgramContribution,
);
const graph: AuthorGraph = sealAuthorGraph({ ...merged });

function build(target: string) {
  const planned = planBuild(linked, graph, [target]);
  return materializeBuild(defineBuild({
    program: linked,
    plan: planned.plan,
  }), []);
}

function producerNames(target: string): string[] {
  return build(target).plan.steps.map((step) => step.producer.name);
}

function producerModules(target: string): string[] {
  return build(target).plan.steps.map((step) => step.producer.module.name);
}

test("Film stops at Composition and HTML compilation remains an ordinary downstream Fragment", () => {
  assert.equal(producerModules("main.composition").includes(htmlProgramProducers.compile.module.name), false);
  assert.deepEqual(producerNames("main.composition").filter((name) => name.startsWith("append-")).sort(), [
    filmProducers.appendAudioTrack.name,
    filmProducers.appendVisualTrack.name,
    filmProducers.appendVisualTrack.name,
  ].sort());
  assert.equal(
    producerModules("main.program").filter((name) => name === htmlProgramProducers.compile.module.name).length,
    1,
  );
});

test("Film folds peer Tracks, then hands an ordinary Composition to HTML", () => {
  let set = createFilmTrackSet();
  set = appendFilmVisualTrack(set, space, titleVisual);
  set = appendFilmVisualTrack(set, space, background);
  set = appendFilmAudioTrack(set, space, audio);
  const composition = compileFilmComposition(filmProgram, canvas, space, set);
  assert.deepEqual(composition.audio.contributions.map((track) => track.id), ["empty-audio-track"]);
  assert.deepEqual(composition.visual.root.members.map((member) => member.kind === "track" ? member.track.id : member.id),
    ["background-track", "title"]);
  const document = compileHtmlProgram(composition);
  assert.match(document.html, /data-hypit-text-run="title-text"/u);
  assert.match(document.html, /data-hypit-occurrence-path="\[&quot;background&quot;\]"/u);
});

test("FilmTrackSet permits a reusable VisualTrack value in more than one input slot", () => {
  const set = appendFilmVisualTrack(createFilmTrackSet(), space, background);
  const duplicate = sealVisualTrack({...background });
  const reused = appendFilmVisualTrack(set, space, duplicate);
  assert.equal(reused.tracks.length, 2);
  assert.notEqual(reused.tracks[0], reused.tracks[1]);
});

test("Film root preserves repeated closed audio signals independently of AudioTrack id", () => {
  let set = createFilmTrackSet();
  set = appendFilmAudioTrack(set, space, audio);
  set = appendFilmAudioTrack(set, space, structuredClone(audio));
  const composition = compileFilmComposition(sealFilmProgram({
    id: "repeated-audio",
    clearColor: "#000000", visual: { members: [] },
    audio: [0, 1],
  }), canvas, space, set);
  assert.equal(composition.audio.contributions.length, 2);
  assert.deepEqual(composition.audio.contributions.map((track) => track.id), [audio.id, audio.id]);
});
