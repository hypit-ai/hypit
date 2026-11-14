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
  pictureType,
  pointwiseOperatorTemporalSupport,
  sealAudiovisualProgram,
  sealOccurrence,
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
      graded: { kind: "apply", operator: pictureOperator("project:grade", ["picture"]), inputs: { picture: "interviewPlaced" }, controlMappings: {} },
      broll: { kind: "use", occurrence: "b-roll", output: "picture" },
      brollPlaced: { kind: "remap", input: "broll", mapping: spatialMapping(
        mainSpace, broll.source.outputs.picture!.spatialDomain!) },
      transition: { kind: "apply", operator: pictureOperator("project:transition", ["outgoing", "incoming"]),
        inputs: { outgoing: "graded", incoming: "brollPlaced" }, controlMappings: {} },
      root: { kind: "over", inputs: ["transition"] },
    } },
    audio: { root: "mix", nodes: {
      dialogue: { kind: "use", occurrence: "interview-use", output: "audio" },
      compressed: { kind: "apply", operator: audioOperator("project:compressor", ["signal"]),
        inputs: { signal: "dialogue" }, controlMappings: {} },
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
    inputs: { outgoing: "graded", incoming: "brollPlaced" }, controlMappings: {},
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
        inputs: { signal: "music", sidechain: "dialogue" }, controlMappings: {},
      },
      sharedSend: { kind: "mix", inputs: ["dialogue", "duckedMusic"] },
      return: {
        kind: "apply",
        operator: audioOperator("project:reverb", ["signal"]),
        inputs: { signal: "sharedSend" }, controlMappings: {},
      },
      master: { kind: "mix", inputs: ["dialogue", "duckedMusic", "return"] },
    } },
  });
  assert.deepEqual(program.audio?.nodes.duckedMusic, {
    kind: "apply",
    operator: audioOperator("project:sidechain-compressor", ["signal", "sidechain"]),
    inputs: { signal: "music", sidechain: "dialogue" }, controlMappings: {},
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
  const originalOccurrence = program.occurrences["interview-use"]!;
  const remapped = sealAudiovisualProgram({
    ...program,
    occurrences: {
      ...program.occurrences,
      "interview-use": sealOccurrence({
        ...originalOccurrence,
        selections: {
          ...originalOccurrence.selections,
          picture: { kind: "signal", mapping: gapMapping },
        },
      }),
    },
  });
  assert.deepEqual(evaluateAudiovisualProgramAt(remapped, seconds(5)).picture?.nodes.interview,
    { kind: "transparent" });
  assert.equal(evaluateAudiovisualProgramAt(remapped, seconds(5)).audio?.nodes.dialogue?.kind, "sample");
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
  }), /expected @hypit\/audiovisual#Picture/u);
  assert.throws(() => sealAudiovisualProgram({
    ...valid,
    picture: { root: "interview", nodes: {
      interview: { kind: "use", occurrence: "interview-use", output: "picture" },
    } },
  }), /root closes in interview:picture-space, not main:picture-space/u);
});
