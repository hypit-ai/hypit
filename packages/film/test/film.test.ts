import assert from "node:assert/strict";
import test from "node:test";

import { registerTypeValidatorFacets } from "@svml/component-kit";
import {
  compositionContractsComponent,
  contractTypes,
  sealAudioTrack,
  sealProgramSpace,
  sealVisualTrack,
  videoContractManifests,
} from "@svml/contracts";
import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  sealTypedModule,
  start,
} from "@svml/core";
import { ProducerRegistry, NodeDriver } from "@svml/driver-node";
import {
  bindAuthorFragment,
  elaborateGraphFragment,
  mergeFragmentContributions,
} from "@svml/elaborator";
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
} from "@svml/film";
import {
  compileHyperframesDocument,
  compileHyperframesImplementationDigest,
  hyperframesDocumentFragment,
  hyperframesManifest,
  hyperframesProducers,
  hyperframesTypes,
} from "@svml/hyperframes";
import type { CanonicalValue, CompiledGraph, StoredValue, TypedRecord } from "@svml/protocol";
import { svsManifest } from "@svml/svs";
import {
  renderTextTrack,
  renderTextTrackImplementationDigest,
  sealTextTrackProgram,
  textTrackFragment,
  textTrackManifest,
  textTrackProducers,
  textTrackTypes,
} from "@svml/text-track";
import { admitRecord, TypeValidatorRegistry } from "@svml/validation";

const space = sealProgramSpace({
  contract: "svml.program-space@0",
  durationSec: 4,
  frameRate: { numerator: 30, denominator: 1 },
});

function validatorRegistry(): TypeValidatorRegistry {
  const registry = new TypeValidatorRegistry();
  registerTypeValidatorFacets(registry, compositionContractsComponent.validators);
  return registry;
}
const filmProgram = sealFilmProgram({
  contract: "svml.film-program@1",
  id: "main-film",
  frameRate: space.frameRate,
  canvas: { width: 1080, height: 1920, clearColor: "#000000" },
});
const textProgram = sealTextTrackProgram({
  contract: "svml.text-track-program@1",
  id: "title-track",
  programSpaceDigest: space.digest,
  items: [{
    id: "title",
    text: "Semantic Video Markup Language",
    span: { startFrame: 10, endFrameExclusive: 100 },
    z: 60,
    tieBreak: "title",
    box: { xPercent: 8, yPercent: 10, widthPercent: 84, heightPercent: 20 },
    appearance: { color: "#ffffff", fontSizePx: 56, fontWeight: 800 },
  }],
});
const background = sealVisualTrack({
  contract: "svml.visual-track@1",
  visualIr: "svml.hyperframes-visual-ir@1",
  id: "background-track",
  programSpaceDigest: space.digest,
  sources: [{ name: "fixture", digest: digestOf("background") }],
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
  programSpaceDigest: space.digest,
  sources: [{ name: "fixture", digest: digestOf("audio") }],
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
  filmManifest,
  textTrackManifest,
]);
const origin = {
  kind: "authored" as const,
  sourceDigest: digestOf("source:film-test"),
  frontendClosureDigest: digestOf("frontend:film-test"),
};
const records = await Promise.all([
  sealRecord({ id: "space", type: contractTypes.programSpace, value: stored(space), conformance: "exact", origin }),
  sealRecord({ id: "film-program", type: filmTypes.program, value: stored(filmProgram), conformance: "exact", origin }),
  sealRecord({ id: "text-program", type: textTrackTypes.program, value: stored(textProgram), conformance: "exact", origin }),
  sealRecord({ id: "background", type: contractTypes.visualTrack, value: stored(background), conformance: "exact", origin }),
  sealRecord({ id: "audio", type: contractTypes.audioTrack, value: stored(audio), conformance: "exact", origin }),
].map(async (record) => await admitRecord(closure, record, validatorRegistry())));
const linked = link(closure, [sealTypedModule({ id: "author:film-test", closureDigest: closure.digest, records })]);

const textInstance = elaborateGraphFragment(linked, textTrackFragment, {
  id: "title",
  fragment: textTrackFragment.id,
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
    targets: [{ output: target, accepts: "exact" }],
    bindings: [],
  }));
}

function producerNames(target: string): string[] {
  return build(target).plan.steps.map((step) => step.producer.name);
}

function producerModules(target: string): string[] {
  return build(target).plan.steps.map((step) => step.producer.module.name);
}

test("Film stops at Composition and Hyperframes remains an ordinary downstream Fragment", () => {
  assert.deepEqual(producerNames("title.track"), [textTrackProducers.render.name]);
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
  registry.registerProducer(textTrackProducers.render, renderTextTrackImplementationDigest, ({ inputs }) => ({
    outputs: { track: stored(renderTextTrack(inline(inputs.space) as typeof space, inline(inputs.program) as typeof textProgram)) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.createTrackSet, createFilmTrackSetImplementationDigest, ({ inputs }) => ({
    outputs: { set: stored(createFilmTrackSet(inline(inputs.space) as typeof space)) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.appendVisualTrack, appendFilmVisualTrackImplementationDigest, ({ inputs }) => ({
    outputs: { set: stored(appendFilmVisualTrack(inline(inputs.set) as never, inline(inputs.track) as never)) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.appendAudioTrack, appendFilmAudioTrackImplementationDigest, ({ inputs }) => ({
    outputs: { set: stored(appendFilmAudioTrack(inline(inputs.set) as never, inline(inputs.track) as never)) },
    needs: {},
  }));
  registry.registerProducer(filmProducers.compileComposition, compileFilmCompositionImplementationDigest, ({ inputs }) => ({
    outputs: { composition: stored(compileFilmComposition(inline(inputs.program) as never, inline(inputs.set) as never)) },
    needs: {},
  }));
  registry.registerProducer(hyperframesProducers.compile, compileHyperframesImplementationDigest, ({ inputs }) => ({
    outputs: { document: stored(compileHyperframesDocument(inline(inputs.composition) as never)) },
    needs: {},
  }));

  const result = await new NodeDriver({ producers: registry, validators: validatorRegistry() }).run(build("main.document"));
  assert.equal(result.status, "complete");
  const documentRecord = result.state.records.find((record) => record.type.module.name === hyperframesTypes.document.module.name);
  assert(documentRecord);
  const document = inline(documentRecord) as { readonly html: string };
  assert.match(document.html, /Semantic Video Markup Language/u);
  assert.match(document.html, /background-track/u);
  assert.equal(result.state.records.filter((record) => record.type.name === filmTypes.trackSet.name).length, 4);
});

test("Film rejects duplicate Track ids before Composition", () => {
  const set = appendFilmVisualTrack(createFilmTrackSet(space), background);
  const duplicate = sealVisualTrack({ ...background, sources: [{ name: "other", digest: digestOf("other") }] });
  assert.throws(() => appendFilmVisualTrack(set, duplicate), /already contains Track id/u);
});
