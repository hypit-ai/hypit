import { compositionComponent, spatialComponent, videoContractManifests } from "../../../test/support/video-domain.js";
import { registerTypeValidatorFacets } from "@narratage/component-kit";
import { programSpaceTypes, sealProgramSpace } from "@narratage/program-space";
import { compositionTypes, sealAudioTrack, sealVisualTrack } from "@narratage/composition";
import type { Composition, Track } from "@narratage/composition";
import type { FontArtifactRef } from "@narratage/media";
import { sealCanvasSpace, spatialTypes } from "@narratage/spatial";
import assert from "node:assert/strict";
import test from "node:test";

import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@narratage/core";
import { ProducerRegistry, NodeDriver } from "@narratage/driver-node";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
} from "@narratage/elaborator";
import {
  appendFilmAudioTrack,
  appendFilmAudioTrackImplementationDigest,
  appendFilmVisualTrack,
  appendFilmVisualTrackImplementationDigest,
  compileFilmComposition,
  compileFilmCompositionImplementationDigest,
  createFilmAssemblyFragment,
  createFilmTrackSet,
  createFilmTrackSetImplementationDigest,
  filmManifest,
  filmProducers,
  filmTypes,
  sealFilmProgram,
} from "@narratage/film";
import {
  compileHyperframesDocument,
  compileHyperframesImplementationDigest,
  hyperframesDocumentFragment,
  hyperframesManifest,
  hyperframesProducers,
  hyperframesTypes,
} from "@narratage/hyperframes";
import type { CanonicalValue, CompiledGraph, StoredValue, TypedRecord } from "@narratage/protocol";
import { svsManifest } from "@narratage/svs";
import { textManifest } from "@narratage/text";
import {
  renderTypographyTrack,
  renderTypographyTrackImplementationDigest,
  sealTypographyTrackProgram,
  stillTextMotion,
  typographyTrackFragment,
  typographyTrackManifest,
  typographyTrackProducers,
  typographyTrackTypes,
} from "@narratage/typography-track";
import type { TextStyle } from "@narratage/typography-track";
import { admitRecord, TypeValidatorRegistry } from "@narratage/validation";

const space = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 4,
  frameRate: { numerator: 30, denominator: 1 },
});

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionComponent.validators);
  registerTypeValidatorFacets(registry, spatialComponent.validators);
  return registry;
}
const canvas = sealCanvasSpace({
  contract: "svml.canvas-space@1",
  widthPx: 1080,
  heightPx: 1920,
  origin: "top-left",
  xDirection: "right",
  yDirection: "down",
  pixelAspect: "square",
});
const filmProgram = sealFilmProgram({
  contract: "svml.film-program@1",
  id: "main-film",
  clearColor: "#000000",
});
const titleFont: FontArtifactRef = {
  contract: "svml.font-artifact@1",
  sources: [{ artifact: {
    kind: "blob", digest: digestOf("film-test-title-font"), size: 1, mediaType: "font/woff2",
  } }],
  weight: 800,
  style: "normal",
};
const titleStyle: TextStyle = {
  contract: "svml.text-style@1",
  id: "title-style",
  stackingOrder: 60,
  typography: {
    fonts: [titleFont], sizePx: 56, weight: 800, style: "normal",
    axes: [], features: [], synthesis: "none", kerning: "auto", trackingPx: 0,
    wordSpacingPx: 0, lineHeight: 1.2, direction: "auto", writingMode: "horizontal-tb",
    baselineShiftPx: 0, tabSize: 4, indentationPx: 0, paragraphBeforePx: 0,
    paragraphAfterPx: 0, transform: "none", variantCaps: "normal", verticalAlign: "baseline", decorations: [],
    cjk: { textSpacing: "normal", punctuationTrim: "none" },
  },
  paints: [{ kind: "fill", paint: { kind: "solid", color: "#ffffff" } }],
  area: {
    inlineSize: "fixed", blockSize: "fixed",
    paddingPx: { inlineStart: 0, inlineEnd: 0, blockStart: 0, blockEnd: 0 },
    inlineAlign: "center", blockAlign: "center", wrap: "word", overflow: "visible",
    clipToFrame: false, columns: 1, columnGapPx: 0, metricEdge: "line-box",
  },
  point: { anchorInline: "center", anchorBlock: "center" },
  path: { side: "left", orientation: "follow", startMarginPx: 0, endMarginPx: 0, align: "start", reverse: false, overflow: "visible" },
};
const textProgram = sealTypographyTrackProgram({
  contract: "svml.typography-track-program@1",
  id: "title-track",
  items: [{
    id: "title",
    span: { startFrame: 10, endFrameExclusive: 100 },
    tieBreak: "title",
    geometry: { kind: "area", frame: { contract: "svml.spatial-frame@1", xPx: 86.4, yPx: 192, widthPx: 907.2, heightPx: 384 } },
    document: { paragraphs: [{ id: "title", inlines: [{ kind: "text", id: "title-text", text: "Semantic Video Markup Language" }] }] },
    style: titleStyle,
    motion: stillTextMotion(),
  }],
});
const background = sealVisualTrack({
  contract: "svml.visual-track@1",
  visualIr: "svml.visual-ir@1",
  id: "background-track",
  presents: [{
    id: "background",
    span: { startFrame: 0, endFrameExclusive: 120 },
    stacking: { order: 0, tieBreak: "background" },
    elements: [{ id: "root", kind: "box", order: 0, style: [{ name: "background-color", value: "#223344" }] }],
  }],
});
const audio = sealAudioTrack({
  contract: "svml.audio-track@1",
  id: "empty-audio-track",
  clips: [],
});

function inline(record: TypedRecord | undefined): CanonicalValue {
  assert(record, "missing Producer input");
  assert.equal(record.value.kind, "inline");
  return record.value.value;
}

function stored(value: CanonicalValue): StoredValue {
  return { kind: "inline", value };
}

const closure = createResolvedClosure([
  ...videoContractManifests,
  svsManifest,
  hyperframesManifest,
  textManifest,
  filmManifest,
  typographyTrackManifest,
]);
const origin = {
  kind: "authored" as const,
};
const records = await Promise.all([
  sealRecord({ id: "space", type: programSpaceTypes.programSpace, value: stored(space), origin }),
  sealRecord({ id: "canvas", type: spatialTypes.canvas, value: stored(canvas), origin }),
  sealRecord({ id: "film-program", type: filmTypes.program, value: stored(filmProgram), origin }),
  sealRecord({ id: "text-program", type: typographyTrackTypes.program, value: stored(textProgram), origin }),
  sealRecord({ id: "background", type: compositionTypes.visualTrack, value: stored(background), origin }),
  sealRecord({ id: "audio", type: compositionTypes.audioTrack, value: stored(audio), origin }),
].map(async (record) => await admitRecord(closure, record, validatorRegistry())));
const linked = link(closure, [sealTypedModule({ records })]);

const textInstance = elaborateGraphFragment(linked, typographyTrackFragment, {
  id: "title",
  fragment: typographyTrackFragment.id,
  inputs: {
    space: { kind: "record", id: "space" },
    program: { kind: "record", id: "text-program" },
  },
});
const textContribution = bindAuthorFragment(textInstance, { track: "title.track" });

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
  fragment: filmFragment.id,
  inputs: {
    program: { kind: "record", id: "film-program" },
    canvas: { kind: "record", id: "canvas" },
    space: { kind: "record", id: "space" },
    title: { kind: "logical-output", id: "title.track" },
    background: { kind: "record", id: "background" },
    audio: { kind: "record", id: "audio" },
  },
});
const filmContribution = bindAuthorFragment(filmInstance, {
  composition: "main.composition",
});
const hyperframesInstance = elaborateGraphFragment(linked, hyperframesDocumentFragment, {
  id: "main-render",
  fragment: hyperframesDocumentFragment.id,
  inputs: {
    composition: { kind: "logical-output", id: "main.composition" },
    space: { kind: "record", id: "space" },
  },
});
const hyperframesContribution = bindAuthorFragment(hyperframesInstance, {
  document: "main.document",
});
const merged = mergeFragmentContributions(
  { outputs: [], candidates: [], operations: [] },
  textContribution,
  filmContribution,
  hyperframesContribution,
);
const graph: CompiledGraph = sealCompiledGraph({ program: linked.semanticDigest, ...merged });

function build(target: string) {
  return start(linked, graph, sealBuildRequest({
    graph: graph.id,
    targets: [{ output: target }],
  }));
}

function producerNames(target: string): string[] {
  return build(target).plan.steps.map((step) => step.producer.name);
}

function producerModules(target: string): string[] {
  return build(target).plan.steps.map((step) => step.producer.module.name);
}

test("Film stops at Composition and Hyperframes remains an ordinary downstream Fragment", () => {
  assert.deepEqual(producerNames("title.track"), [typographyTrackProducers.render.name]);
  assert.equal(producerModules("main.composition").includes(hyperframesProducers.compile.module.name), false);
  assert.deepEqual(producerNames("main.composition").filter((name) => name.startsWith("append-")).sort(), [
    filmProducers.appendAudioTrack.name,
    filmProducers.appendVisualTrack.name,
    filmProducers.appendVisualTrack.name,
  ].sort());
  assert.equal(
    producerModules("main.document").filter((name) => name === hyperframesProducers.compile.module.name).length,
    1,
  );
});

test("the Driver folds peer Tracks, then independently compiles the Composition", async () => {
  const registry = new ProducerRegistry();
  registry.registerProducer(typographyTrackProducers.render, renderTypographyTrackImplementationDigest, ({ inputs }) => ({
    outputs: { track: stored(renderTypographyTrack(inline(inputs.space) as typeof space, inline(inputs.program) as typeof textProgram)) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.createTrackSet, createFilmTrackSetImplementationDigest, () => ({
    outputs: { set: stored(createFilmTrackSet()) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.appendVisualTrack, appendFilmVisualTrackImplementationDigest, ({ inputs }) => ({
    outputs: { set: stored(appendFilmVisualTrack(
      inline(inputs.set) as never,
      inline(inputs.space) as typeof space,
      inline(inputs.track) as never,
    )) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.appendAudioTrack, appendFilmAudioTrackImplementationDigest, ({ inputs }) => ({
    outputs: { set: stored(appendFilmAudioTrack(
      inline(inputs.set) as never,
      inline(inputs.space) as typeof space,
      inline(inputs.track) as never,
    )) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.compileComposition, compileFilmCompositionImplementationDigest, ({ inputs }) => ({
    outputs: { composition: stored(compileFilmComposition(
      inline(inputs.program) as never,
      inline(inputs.canvas) as typeof canvas,
      inline(inputs.space) as typeof space,
      inline(inputs.set) as never,
    )) },
    needs: {},
  }));
  registry.registerProducer(hyperframesProducers.compile, compileHyperframesImplementationDigest, ({ inputs }) => ({
    outputs: { document: stored(compileHyperframesDocument(
      inline(inputs.composition) as never,
      inline(inputs.space) as typeof space,
    )) },
    needs: {},
  }));

  const result = await new NodeDriver({ producers: registry, validators: validatorRegistry() }).run(build("main.document"));
  assert.equal(result.status, "complete");
  const documentRecord = result.state.records.find((record) => record.type.module.name === hyperframesTypes.document.module.name);
  assert(documentRecord);
  const document = inline(documentRecord) as { readonly html: string };
  assert.match(document.html, /data-svml-text-run="title-text"/u);
  assert.match(document.html, /background-track/u);
  assert.equal(result.state.records.filter((record) => record.type.name === filmTypes.trackSet.name).length, 4);
});

test("Film rejects duplicate Track ids before Composition", () => {
  const set = appendFilmVisualTrack(createFilmTrackSet(), space, background);
  const duplicate = sealVisualTrack({ ...background });
  assert.throws(() => appendFilmVisualTrack(set, space, duplicate), /already contains Track id/u);
});
