import { blobManifest } from "@hypit/blob";
import { sealTimeline, timelineManifest, timelineTypes } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import { registerTypeRefinements } from "@hypit/refinement";
import { compositionComponent, compositionManifest, compositionTypes, sealAudioTrack, sealVisualTrack } from "@hypit/composition";
import type { Composition, Track } from "@hypit/composition";
import { mediaManifest } from "@hypit/media";
import type { FontArtifactRef } from "@hypit/media";
import { sealCanvas, spatialComponent, spatialManifest, spatialTypes } from "@hypit/spatial";
import { recipeManifest } from "@hypit/recipe";
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
import { ProducerRegistry, Executor } from "@hypit/executor";
import { InProcessBuildScheduler } from "@hypit/hypit/runtime";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
} from "@hypit/author";
import { appendFilmAudioTrack, appendFilmVisualTrack, compileFilmComposition, createFilmAssemblyFragment, createFilmTrackSet, filmManifest, filmProducers, filmTypes, sealFilmProgram } from "@hypit/film";
import { compileHtmlProgram, htmlProgramFragment, htmlProgramManifest, htmlProgramProducers, htmlProgramTypes } from "@hypit/html-program";
import type { AuthorGraph, BuildState, CanonicalValue, Value, TypedRecord } from "@hypit/protocol";
import { renderFineTextOccurrence, stillTextMotion } from "@hypit/text-fine";
import type { TextStyle } from "@hypit/text-fine";
import { validateRecord, RefinementRegistry } from "@hypit/refinement";

async function runBuild(executor: Executor, state: BuildState) {
  return (await new InProcessBuildScheduler(executor).run([{
    id: "film-test",
    definition: { format: "hypit.build-definition@1", program: state.program, plan: state.plan },
    facts: [],
  }]))[0]!;
}

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
  clearColor: "#000000",
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
      kind: "flow", z: 60, frame: { xPx: 86.4, yPx: 192, widthPx: 907.2, heightPx: 384 },
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
const background = sealVisualTrack({ timelineId: "test-space",
  visualIr: "hypit.visual-ir@1",
  id: "background-track",
  presents: [{
    id: "background",
    order: 0,
    z: 0,
    span: { startFrame: 0, endFrameExclusive: 120 },
    elements: [{ id: "root", kind: "box", order: 0, style: [{ name: "background-color", value: "#223344" }] }],
  }],
});
const audio = sealAudioTrack({ timelineId: "test-space",
  id: "empty-audio-track",
  clips: [],
});

function valueOf(record: TypedRecord | undefined): CanonicalValue {
  assert(record, "missing Producer input");
  return record.value;
}

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
].map(async (record) => await validateRecord(record, validatorRegistry())));
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
    timeline: { kind: "record", id: "timeline" },
  },
});
const htmlProgramContribution = bindAuthorFragment(htmlProgramInstance, {
  program: "main.program",
});
const merged = mergeFragmentContributions(
  { outputs: [], candidates: [], operations: [] },
  filmContribution,
  htmlProgramContribution,
);
const graph: AuthorGraph = sealAuthorGraph({ ...merged });

function build(target: string) {
  const planned = planBuild(linked, graph, {
    format: "hypit.run-graph@1",
    records: [],
    candidates: [],
    operations: [],
    satisfactions: [],
    targets: [{ output: target }],
  });
  return materializeBuild(defineBuild({
    program: link(linked.closure, [...linked.records, ...planned.initialRecords]),
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

test("the scheduled Producers fold peer Tracks, then independently compile the Composition", async () => {
  const registry = new ProducerRegistry();
  registry.registerProducer(filmProducers.createTrackSet, () => ({ kind: "output", value: stored(createFilmTrackSet()) }));
  registry.registerProducer(filmProducers.appendVisualTrack, ({ inputs }) => ({ kind: "output", value: stored(appendFilmVisualTrack(
      valueOf(inputs.set) as never,
      valueOf(inputs.timeline) as typeof space,
      valueOf(inputs.track) as never,
    )) }));
  registry.registerProducer(filmProducers.appendAudioTrack, ({ inputs }) => ({ kind: "output", value: stored(appendFilmAudioTrack(
      valueOf(inputs.set) as never,
      valueOf(inputs.timeline) as typeof space,
      valueOf(inputs.track) as never,
    )) }));
  registry.registerProducer(filmProducers.compileComposition, ({ inputs }) => ({ kind: "output", value: stored(compileFilmComposition(
      valueOf(inputs.program) as never,
      valueOf(inputs.canvas) as typeof canvas,
      valueOf(inputs.timeline) as typeof space,
      valueOf(inputs.set) as never,
    )) }));
  registry.registerProducer(htmlProgramProducers.compile, ({ inputs }) => ({ kind: "output", value: stored(compileHtmlProgram(
      valueOf(inputs.composition) as never,
      valueOf(inputs.timeline) as typeof space,
    )) }));

  const result = await runBuild(new Executor({ producers: registry, refinements: validatorRegistry() }), build("main.program"));
  assert.equal(result.status, "complete");
  const documentRecord = result.state.records.find((record) => record.type.module.name === htmlProgramTypes.program.module.name);
  assert(documentRecord);
  const document = valueOf(documentRecord) as { readonly html: string };
  assert.match(document.html, /data-hypit-text-run="title-text"/u);
  assert.match(document.html, /background-track/u);
  assert.equal(result.state.records.filter((record) => record.type.name === filmTypes.trackSet.name).length, 4);
});

test("Film rejects duplicate Track ids before Composition", () => {
  const set = appendFilmVisualTrack(createFilmTrackSet(), space, background);
  const duplicate = sealVisualTrack({...background });
  assert.throws(() => appendFilmVisualTrack(set, space, duplicate), /already contains Track id/u);
});
