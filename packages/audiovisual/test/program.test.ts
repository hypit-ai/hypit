import assert from "node:assert/strict";
import test from "node:test";

import { exactTemporalValue, sealLocalTemporalDomain, sealTemporalMap } from "@hypit/temporal/algebra";
import type { ExactTemporalValue, LocalTemporalDomain, TemporalMap } from "@hypit/temporal/algebra";
import { evaluateSpatialMap, sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import type { AffineSpatialTransform, LocalSpatialDomain, SpatialMap } from "@hypit/spatial/algebra";

import {
  audioType,
  audiovisualComponent,
  audiovisualProducers,
  audiovisualProgramOccurrences,
  audiovisualProgramSource,
  evaluateAudiovisualProgramAt,
  evaluateAudiovisualProgramFrame,
  moveProgramOccurrence,
  occurrenceParentRange,
  outputFrameCount,
  pictureType,
  pointwiseOperatorTemporalSupport,
  projectNleOccurrences,
  projectNleView,
  remapProgramOccurrence,
  rippleTrimProgramOccurrence,
  rollProgramOccurrences,
  sealAudiovisualProgram,
  sealNleView,
  sealOccurrence,
  splitNleViewOccurrence,
  splitProgramOccurrence,
  slipProgramOccurrence,
  trimProgramOccurrence,
} from "../src/index.js";
import type { AudioOperator, AudiovisualProgram, Occurrence, PictureOperator, ProgramSource } from "../src/index.js";

const seconds = (value: number): ExactTemporalValue => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const domain = (id: string, duration: number): LocalTemporalDomain => sealLocalTemporalDomain({ id, duration: seconds(duration) });
const space = (id: string, width = 1920, height = 1080): LocalSpatialDomain => sealLocalSpatialDomain({
  id,
  region: { x: 0, y: 0, width, height },
});
function mapping(target: LocalTemporalDomain, source: LocalTemporalDomain): TemporalMap {
  return sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: seconds(0), end: target.duration }, sourceAtStart: seconds(0),
    rate: { numerator: 1, denominator: 1 },
  }] }] });
}

function spatialMapping(
  target: LocalSpatialDomain,
  source: LocalSpatialDomain,
  transform: AffineSpatialTransform = { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
): SpatialMap {
  return sealSpatialMap({ target, source, transform });
}

const operatorProgram = (id: string) => ({ format: `${id}@1`, payload: {}, artifacts: [] });
const pictureOperator = (id: string, inputs: readonly string[]): PictureOperator => ({
  id, inputs, temporalControls: {}, temporalSupport: pointwiseOperatorTemporalSupport(inputs), program: operatorProgram(id),
});
const audioOperator = (id: string, inputs: readonly string[]): AudioOperator => ({
  id, inputs, temporalControls: {}, temporalSupport: pointwiseOperatorTemporalSupport(inputs), program: operatorProgram(id),
});

const main = domain("main:time", 12);
const mainSpace = space("main:picture-space");
function source(id: string, outputs: readonly ("picture" | "audio")[], duration = 12): ProgramSource {
  return { id, outputs: Object.fromEntries(outputs.map((name) => [name, {
    kind: "signal" as const,
    type: name === "picture" ? pictureType : audioType,
    domain: domain(`${id}:${name}-time`, duration),
    ...(name === "picture" ? { spatialDomain: space(`${id}:picture-space`) } : {}),
  }])) };
}
function occurrence(id: string, input: ProgramSource, outputs: readonly string[], at = 0, duration = 12): Occurrence {
  const local = domain(`${id}:time`, duration);
  return sealOccurrence({
    id, source: input, domain: local,
    placement: { parent: main, start: seconds(at), active: { start: seconds(0), end: seconds(duration) } },
    selections: Object.fromEntries(outputs.map((name) => {
      const output = input.outputs[name]!;
      assert.equal(output.kind, "signal");
      return [name, { kind: "signal" as const, mapping: mapping(local, output.domain) }];
    })),
  });
}

function fixture(): AudiovisualProgram {
  const interview = occurrence("interview-use", source("interview", ["picture", "audio"]), ["picture", "audio"]);
  const broll = occurrence("b-roll", source("product", ["picture"]), ["picture"]);
  const music = occurrence("music-use", source("music", ["audio"]), ["audio"]);
  return sealAudiovisualProgram({
    id: "main", domain: main, pictureDomain: mainSpace,
    occurrences: { "interview-use": interview, "b-roll": broll, "music-use": music },
    picture: { root: "root", nodes: {
      interview: { kind: "use", occurrence: "interview-use", output: "picture" },
      interviewPlaced: { kind: "remap", input: "interview", mapping: spatialMapping(
        mainSpace, interview.source.outputs.picture!.spatialDomain!) },
      graded: { kind: "apply", operator: pictureOperator("project:grade", ["picture"]), inputs: { picture: "interviewPlaced" }, controlBindings: {} },
      broll: { kind: "use", occurrence: "b-roll", output: "picture" },
      brollPlaced: { kind: "remap", input: "broll", mapping: spatialMapping(
        mainSpace, broll.source.outputs.picture!.spatialDomain!) },
      transition: { kind: "apply", operator: pictureOperator("project:transition", ["outgoing", "incoming"]),
        inputs: { outgoing: "graded", incoming: "brollPlaced" }, controlBindings: {} },
      root: { kind: "over", inputs: ["transition"] },
    } },
    audio: { root: "mix", nodes: {
      dialogue: { kind: "use", occurrence: "interview-use", output: "audio" },
      compressed: { kind: "apply", operator: audioOperator("project:compressor", ["signal"]),
        inputs: { signal: "dialogue" }, controlBindings: {} },
      music: { kind: "use", occurrence: "music-use", output: "audio" },
      mix: { kind: "mix", inputs: ["compressed", "music"] },
    } },
  });
}

test("one Occurrence carries coordinated Picture and Audio output mappings", () => {
  const program = fixture();
  assert.deepEqual(Object.keys(program.occurrences["interview-use"]!.selections).sort(), ["audio", "picture"]);
  assert.equal(audiovisualProgramOccurrences(program).length, 3);
  assert.deepEqual(Object.keys(audiovisualProgramSource(program).outputs).sort(), ["audio", "picture"]);
});

test("processed Picture and Audio nodes remain closed inputs to later operators", () => {
  const program = fixture();
  assert.deepEqual(program.picture?.nodes.transition, {
    kind: "apply", operator: pictureOperator("project:transition", ["outgoing", "incoming"]),
    inputs: { outgoing: "graded", incoming: "brollPlaced" }, controlBindings: {},
  });
  assert.deepEqual(program.audio?.nodes.mix, { kind: "mix", inputs: ["compressed", "music"] });
});

test("Audio DAG closes dry, wet, shared return and sidechain routing", () => {
  const base = fixture();
  const program = sealAudiovisualProgram({
    ...base,
    audio: { root: "master", nodes: {
      dialogue: { kind: "use", occurrence: "interview-use", output: "audio" },
      music: { kind: "use", occurrence: "music-use", output: "audio" },
      duckedMusic: {
        kind: "apply",
        operator: audioOperator("project:sidechain-compressor", ["signal", "sidechain"]),
        inputs: { signal: "music", sidechain: "dialogue" }, controlBindings: {},
      },
      sharedSend: { kind: "mix", inputs: ["dialogue", "duckedMusic"] },
      return: {
        kind: "apply",
        operator: audioOperator("project:reverb", ["signal"]),
        inputs: { signal: "sharedSend" }, controlBindings: {},
      },
      master: { kind: "mix", inputs: ["dialogue", "duckedMusic", "return"] },
    } },
  });
  assert.deepEqual(program.audio?.nodes.duckedMusic, {
    kind: "apply",
    operator: audioOperator("project:sidechain-compressor", ["signal", "sidechain"]),
    inputs: { signal: "music", sidechain: "dialogue" }, controlBindings: {},
  });
  assert.deepEqual(program.audio?.nodes.master, {
    kind: "mix", inputs: ["dialogue", "duckedMusic", "return"],
  });
  assert.equal(evaluateAudiovisualProgramAt(program, seconds(3)).audio?.nodes.return?.kind, "apply");
});

test("a closed audiovisual Programme is an ordinary multi-output Source", () => {
  const nested = fixture();
  const nestedSource = audiovisualProgramSource(nested, "nested-scene");
  const nestedUse = occurrence("nested-use", nestedSource, ["picture", "audio"]);
  const outer = sealAudiovisualProgram({
    id: "outer", domain: main, pictureDomain: mainSpace, occurrences: { "nested-use": nestedUse },
    picture: { root: "picture", nodes: { picture: { kind: "use", occurrence: "nested-use", output: "picture" } } },
    audio: { root: "audio", nodes: { audio: { kind: "use", occurrence: "nested-use", output: "audio" } } },
  });
  assert.equal(outer.occurrences["nested-use"]?.source.id, "nested-scene");
});

test("the Programme Source projection is an ordinary typed Producer", async () => {
  const program = fixture();
  const producer = audiovisualComponent.producers.find((candidate) =>
    candidate.producer.name === audiovisualProducers.programSource.name)!;
  const result = await producer.handler({ inputs: { program: { value: program as never } } } as never);
  assert.equal(result.kind, "output");
  assert.deepEqual(result.value, audiovisualProgramSource(program));
});

test("one nested Picture Source can enter two parent regions without inheriting a Canvas", () => {
  const nestedSource = audiovisualProgramSource(fixture(), "nested-scene");
  const leftUse = occurrence("nested-left", nestedSource, ["picture"]);
  const rightUse = occurrence("nested-right", nestedSource, ["picture"]);
  const childSpace = nestedSource.outputs.picture!.spatialDomain!;
  const leftMap = spatialMapping(mainSpace, childSpace,
    { kind: "affine", xx: 2, xy: 0, yx: 0, yy: 2, tx: 0, ty: 0 });
  const rightMap = spatialMapping(mainSpace, childSpace,
    { kind: "affine", xx: 2, xy: 0, yx: 0, yy: 2, tx: -1920, ty: 0 });
  const program = sealAudiovisualProgram({
    id: "two-up",
    domain: main,
    pictureDomain: mainSpace,
    occurrences: { "nested-left": leftUse, "nested-right": rightUse },
    picture: { root: "root", nodes: {
      leftSource: { kind: "use", occurrence: "nested-left", output: "picture" },
      leftPlaced: { kind: "remap", input: "leftSource", mapping: leftMap },
      left: { kind: "crop", input: "leftPlaced", region: { x: 0, y: 0, width: 960, height: 540 } },
      rightSource: { kind: "use", occurrence: "nested-right", output: "picture" },
      rightPlaced: { kind: "remap", input: "rightSource", mapping: rightMap },
      right: { kind: "crop", input: "rightPlaced", region: { x: 960, y: 0, width: 960, height: 540 } },
      root: { kind: "over", inputs: ["left", "right"] },
    } },
  });

  assert.equal(program.occurrences["nested-left"]!.source.id,
    program.occurrences["nested-right"]!.source.id);
  assert.notEqual(program.occurrences["nested-left"]!.id,
    program.occurrences["nested-right"]!.id);
  assert.deepEqual(evaluateSpatialMap(leftMap, { x: 480, y: 270 }), { x: 960, y: 540 });
  assert.deepEqual(evaluateSpatialMap(rightMap, { x: 1440, y: 270 }), { x: 960, y: 540 });
  assert.equal(evaluateSpatialMap(leftMap, { x: 1440, y: 270 }), undefined);

  const evaluated = evaluateAudiovisualProgramAt(program, seconds(3));
  assert.deepEqual(evaluated.picture?.domain, mainSpace);
  assert.deepEqual(evaluated.picture?.nodes.leftPlaced,
    { kind: "remap", input: "leftSource", mapping: leftMap });
  assert.deepEqual(evaluated.picture?.nodes.right,
    { kind: "crop", input: "rightPlaced", region: { x: 960, y: 0, width: 960, height: 540 } });
  assert.deepEqual(evaluateAudiovisualProgramFrame(program,
    { frameRate: { numerator: 24, denominator: 1 } }, 0).evaluation.picture?.nodes.leftPlaced,
  evaluateAudiovisualProgramFrame(program,
    { frameRate: { numerator: 30, denominator: 1 } }, 0).evaluation.picture?.nodes.leftPlaced);
});

test("NLE projection derives one rectangle per Occurrence without Track or frame data", () => {
  const projection = projectNleOccurrences(fixture());
  assert.deepEqual(projection.occurrences.map((item) => item.id), ["b-roll", "interview-use", "music-use"]);
  const interview = projection.occurrences.find((item) => item.id === "interview-use")!;
  assert.deepEqual(interview.parentRange, { start: seconds(0), end: seconds(12) });
  assert.deepEqual(interview.outputs.map((output) => [output.name, output.usedBy]), [
    ["audio", ["audio"]],
    ["picture", ["picture"]],
  ]);
  assert.equal(Object.hasOwn(interview, "track"), false);
  assert.equal(Object.hasOwn(interview.parentRange, "startFrame"), false);
});

test("NLE View groups output facets while Programme remains the only time owner", () => {
  const program = fixture();
  const before = structuredClone(program);
  const view = sealNleView({
    id: "edit",
    program: "main",
    lanes: [
      { id: "motion", label: "Motion", members: [] },
      { id: "b-roll", label: "B-roll", members: [{ occurrence: "b-roll", output: "picture" }] },
      { id: "a-roll-picture", label: "A-roll Picture",
        members: [{ occurrence: "interview-use", output: "picture" }] },
      { id: "a-roll-audio", label: "A-roll Audio",
        members: [{ occurrence: "interview-use", output: "audio" }] },
      { id: "music", label: "Music", members: [{ occurrence: "music-use", output: "audio" }] },
    ],
  }, program);
  const projection = projectNleView(view, program);
  assert.equal(projection.lanes.length, 5);
  assert.equal(projection.lanes[0]!.items.length, 0);
  assert.deepEqual(projection.lanes[2]!.items[0]!.parentRange,
    projection.lanes[3]!.items[0]!.parentRange);
  assert.equal(projection.lanes[2]!.items[0]!.occurrence,
    projection.lanes[3]!.items[0]!.occurrence);
  assert.deepEqual(program, before);
  assert.equal(Object.hasOwn(view.lanes[2]!.members[0]!, "parentRange"), false);
  assert.throws(() => sealNleView({ ...view, lanes: [...view.lanes,
    { id: "duplicate", members: [{ occurrence: "interview-use", output: "picture" }] }] }, program),
  /repeats member/u);
});

test("Programme edits reproject through an unchanged NLE View", () => {
  const original = fixture();
  const view = sealNleView({
    id: "edit",
    program: "main",
    lanes: [{ id: "a-roll", members: [
      { occurrence: "interview-use", output: "picture" },
      { occurrence: "interview-use", output: "audio" },
    ] }],
  }, original);
  const shortened = trimProgramOccurrence(original, "interview-use",
    { start: seconds(0), end: seconds(8) });
  const moved = moveProgramOccurrence(shortened, "interview-use", seconds(2));
  const movedProjection = projectNleView(view, moved);
  assert.deepEqual(movedProjection.lanes[0]!.items.map((item) => item.parentRange), [
    { start: seconds(2), end: seconds(10) },
    { start: seconds(2), end: seconds(10) },
  ]);
  assert.deepEqual(projectNleView(view, original).lanes[0]!.items.map((item) => item.parentRange), [
    { start: seconds(0), end: seconds(12) },
    { start: seconds(0), end: seconds(12) },
  ]);

  const trimmed = trimProgramOccurrence(original, "interview-use",
    { start: seconds(2), end: seconds(10) });
  const trimmedProjection = projectNleView(view, trimmed);
  assert.deepEqual(trimmedProjection.lanes[0]!.items.map((item) => item.parentRange), [
    { start: seconds(2), end: seconds(10) },
    { start: seconds(2), end: seconds(10) },
  ]);
  assert.deepEqual(view.lanes[0]!.members, [
    { occurrence: "interview-use", output: "picture" },
    { occurrence: "interview-use", output: "audio" },
  ]);
  assert.throws(() => moveProgramOccurrence(original, "interview-use", seconds(2)),
    /outside parent domain/u);
});

function editingFixture(): AudiovisualProgram {
  const parent = domain("edit:time", 20);
  const make = (id: string, start: number, duration: number): Occurrence => {
    const local = domain(`${id}:time`, 10);
    const input = source(`${id}:source`, ["audio"], 10);
    return sealOccurrence({
      id,
      source: input,
      domain: local,
      placement: {
        parent,
        start: seconds(start),
        active: { start: seconds(0), end: seconds(duration) },
      },
      selections: { audio: { kind: "signal", mapping: mapping(local,
        (input.outputs.audio as Extract<(typeof input.outputs)[string], { kind: "signal" }>).domain) } },
    });
  };
  const left = make("left", 0, 5);
  const right = make("right", 5, 5);
  const independent = make("independent", 12, 2);
  return sealAudiovisualProgram({
    id: "edit",
    domain: parent,
    occurrences: { left, right, independent },
    audio: { root: "mix", nodes: {
      left: { kind: "use", occurrence: "left", output: "audio" },
      right: { kind: "use", occurrence: "right", output: "audio" },
      independent: { kind: "use", occurrence: "independent", output: "audio" },
      mix: { kind: "mix", inputs: ["left", "right", "independent"] },
    } },
  });
}

test("Roll moves one explicit shared boundary without Track adjacency", () => {
  const original = editingFixture();
  const rolled = rollProgramOccurrences(original, { left: "left", right: "right", at: seconds(6) });
  assert.deepEqual(occurrenceParentRange(rolled.occurrences.left!),
    { start: seconds(0), end: seconds(6) });
  assert.deepEqual(occurrenceParentRange(rolled.occurrences.right!),
    { start: seconds(6), end: seconds(10) });
  assert.deepEqual(rolled.occurrences.left?.selections, original.occurrences.left?.selections);
  assert.deepEqual(rolled.occurrences.right?.selections, original.occurrences.right?.selections);
  assert.deepEqual(rolled.occurrences.independent, original.occurrences.independent);
  assert.throws(() => rollProgramOccurrences(original,
    { left: "left", right: "independent", at: seconds(6) }), /do not share/u);
});

test("Ripple moves only its explicit transient scope", () => {
  const original = editingFixture();
  const rippled = rippleTrimProgramOccurrence(original, "left", {
    active: { start: seconds(0), end: seconds(3) },
    boundary: "end",
    scope: ["right"],
  });
  assert.deepEqual(occurrenceParentRange(rippled.occurrences.left!),
    { start: seconds(0), end: seconds(3) });
  assert.deepEqual(occurrenceParentRange(rippled.occurrences.right!),
    { start: seconds(3), end: seconds(8) });
  assert.deepEqual(occurrenceParentRange(rippled.occurrences.independent!),
    { start: seconds(12), end: seconds(14) });
  assert.throws(() => rippleTrimProgramOccurrence(original, "left", {
    active: { start: seconds(0), end: seconds(3) }, boundary: "end", scope: ["left"],
  }), /cannot contain its target/u);
  assert.throws(() => rippleTrimProgramOccurrence(original, "left", {
    active: { start: seconds(0), end: seconds(3) }, boundary: "end", scope: ["right", "right"],
  }), /repeats Occurrence/u);
});

test("Slip atomically replaces explicit output Maps and preserves placement", () => {
  const original = fixture();
  const occurrence = original.occurrences["interview-use"]!;
  const hold = (output: "picture" | "audio", at: number) => sealTemporalMap({ stages: [{
    target: occurrence.domain,
    source: (occurrence.source.outputs[output] as Extract<(typeof occurrence.source.outputs)[string], { kind: "signal" }>).domain,
    pieces: [{
      target: { start: seconds(0), end: occurrence.domain.duration },
      sourceAtStart: seconds(at),
      rate: { numerator: 0, denominator: 1 },
    }],
  }] });
  const slipped = slipProgramOccurrence(original, occurrence.id, {
    picture: hold("picture", 3),
    audio: hold("audio", 4),
  });
  assert.deepEqual(slipped.occurrences[occurrence.id]?.placement, occurrence.placement);
  assert.deepEqual(slipped.occurrences[occurrence.id]?.selections.picture,
    { kind: "signal", mapping: hold("picture", 3) });
  assert.deepEqual(slipped.occurrences[occurrence.id]?.selections.audio,
    { kind: "signal", mapping: hold("audio", 4) });
  assert.throws(() => slipProgramOccurrence(original, occurrence.id, {}), /at least one/u);
});

test("Programme Split closes Picture, Audio and optional View membership explicitly", () => {
  const original = fixture();
  const view = sealNleView({ id: "edit", program: "main", lanes: [
    { id: "picture", members: [{ occurrence: "interview-use", output: "picture" }] },
    { id: "audio", members: [{ occurrence: "interview-use", output: "audio" }] },
  ] }, original);
  const split = splitProgramOccurrence(original, "interview-use", {
    at: seconds(6), leftId: "interview-left", rightId: "interview-right",
    pictureUses: { interview: { left: "interview-picture-left", right: "interview-picture-right" } },
    audioUses: { dialogue: { left: "interview-audio-left", right: "interview-audio-right" } },
  });
  assert.deepEqual(Object.keys(split.occurrences).sort(),
    ["b-roll", "interview-left", "interview-right", "music-use"]);
  assert.deepEqual(split.picture?.nodes.interview, {
    kind: "over", inputs: ["interview-picture-left", "interview-picture-right"],
  });
  assert.deepEqual(split.audio?.nodes.dialogue, {
    kind: "mix", inputs: ["interview-audio-left", "interview-audio-right"],
  });
  assert.throws(() => projectNleView(view, split), /missing Occurrence interview-use/u);
  const splitView = sealNleView(splitNleViewOccurrence(view,
    "interview-use", "interview-left", "interview-right"), split);
  assert.deepEqual(projectNleView(splitView, split).lanes.map((lane) =>
    lane.items.map((item) => [item.occurrence, item.parentRange])), [
    [
      ["interview-left", { start: seconds(0), end: seconds(6) }],
      ["interview-right", { start: seconds(6), end: seconds(12) }],
    ],
    [
      ["interview-left", { start: seconds(0), end: seconds(6) }],
      ["interview-right", { start: seconds(6), end: seconds(12) }],
    ],
  ]);
  assert.throws(() => splitProgramOccurrence(original, "interview-use", {
    at: seconds(6), leftId: "left", rightId: "right",
  }), /missing use node identities/u);
});

test("exact Programme evaluation resolves active Source positions without a Clock", () => {
  const program = fixture();
  const evaluated = evaluateAudiovisualProgramAt(program, seconds(3));
  assert.deepEqual(evaluated.picture?.nodes.interview, {
    kind: "sample",
    occurrence: "interview-use",
    output: "picture",
    source: "interview",
    temporal: { kind: "signal", domain: domain("interview:picture-time", 12), at: seconds(3), side: "after" },
    sourceSpace: space("interview:picture-space"),
  });
  assert.deepEqual(evaluated.audio?.nodes.dialogue, {
    kind: "sample",
    occurrence: "interview-use",
    output: "audio",
    source: "interview",
    temporal: { kind: "signal", domain: domain("interview:audio-time", 12), at: seconds(3), side: "after" },
  });
  const transition = program.picture?.nodes.transition;
  assert.equal(transition?.kind, "apply");
  if (transition?.kind === "apply") assert.deepEqual(evaluated.picture?.nodes.transition, {
    kind: "apply",
    operator: transition.operator,
    inputs: transition.inputs,
    controlPositions: {},
  });
  assert.throws(() => evaluateAudiovisualProgramAt(program, seconds(12)), /outside Programme domain/u);

  const gapMapping = sealTemporalMap({ stages: [{
    target: program.occurrences["interview-use"]!.domain,
    source: (program.occurrences["interview-use"]!.source.outputs.picture as Extract<ProgramSource["outputs"][string], { kind: "signal" }>).domain,
    pieces: [{
      target: { start: seconds(0), end: seconds(4) },
      sourceAtStart: seconds(0), rate: { numerator: 1, denominator: 1 },
    }],
  }] });
  const remapped = remapProgramOccurrence(program, "interview-use", "picture", gapMapping);
  assert.deepEqual(evaluateAudiovisualProgramAt(remapped, seconds(5)).picture?.nodes.interview,
    { kind: "transparent" });
  assert.equal(evaluateAudiovisualProgramAt(remapped, seconds(5)).audio?.nodes.dialogue?.kind, "sample");
});

test("Output frame sampling selects exact positions without changing the Programme", () => {
  const program = fixture();
  const before = structuredClone(program);
  const twentyFour = { frameRate: { numerator: 24, denominator: 1 } };
  const ntsc = { frameRate: { numerator: 30_000, denominator: 1_001 } };
  assert.equal(outputFrameCount(program.domain.duration, twentyFour), 288);
  assert.equal(outputFrameCount(program.domain.duration, ntsc), 360);
  const evaluated = evaluateAudiovisualProgramFrame(program, twentyFour, 72);
  assert.equal(evaluated.frameCount, 288);
  assert.deepEqual(evaluated.evaluation.at, seconds(3));
  assert.deepEqual(evaluated.evaluation.picture?.nodes.interview, {
    kind: "sample", occurrence: "interview-use", output: "picture", source: "interview",
    temporal: { kind: "signal", domain: domain("interview:picture-time", 12), at: seconds(3), side: "after" },
    sourceSpace: space("interview:picture-space"),
  });
  assert.deepEqual(program, before);
  assert.throws(() => evaluateAudiovisualProgramFrame(program, twentyFour, 288), /outside/u);
});

test("Programme rejects hidden unused facts, graph cycles and wrong signal ports", () => {
  const valid = fixture();
  assert.throws(() => sealAudiovisualProgram({
    ...valid, occurrences: { ...valid.occurrences,
      orphan: occurrence("orphan", source("orphan-source", ["picture"]), ["picture"]) },
  }), /unused Occurrence orphan/u);
  assert.throws(() => sealAudiovisualProgram({
    ...valid, picture: { ...valid.picture!, nodes: { ...valid.picture!.nodes,
      root: { kind: "over", inputs: ["root"] } } },
  }), /cycle/u);
  assert.throws(() => sealAudiovisualProgram({
    ...valid, picture: { ...valid.picture!, nodes: { ...valid.picture!.nodes,
      interview: { kind: "use", occurrence: "interview-use", output: "audio" } } },
  }), /expected @hypit\/audiovisual@1#Picture/u);
  assert.throws(() => sealAudiovisualProgram({
    ...valid,
    picture: { root: "interview", nodes: {
      interview: { kind: "use", occurrence: "interview-use", output: "picture" },
    } },
  }), /root closes in interview:picture-space, not main:picture-space/u);
});
