import assert from "node:assert/strict";
import test from "node:test";

import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { programFrameSampleBoundary, programSpaceSampleFrames } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import type { CompleteSemanticMap } from "@hypit/semantic-map";

import {
  assertWindowRelation,
  locateSelectionOccurrences,
  projectMomentWindows,
  projectProgramWindow,
  projectSegmentWindow,
  projectSelectionWindows,
  resolveTriggeredSchedule,
  temporalDurationInSamples,
} from "../src/index.js";

const space: ProgramSpace = {
  durationSec: 10,
  frameRate: { numerator: 30, denominator: 1 },
};

const map: CompleteSemanticMap = {
  tokens: [],
  anchors: [
    { identity: "a", frame: 30 },
    { identity: "b", frame: 60 },
    { identity: "c", frame: 90 },
    { identity: "d", frame: 120 },
    { identity: "late", frame: 240 },
    { identity: "segment:answer:start", frame: 60 },
    { identity: "segment:answer:end", frame: 120 },
  ],
};

const selection = (id: string, occurrences: NarrativeSelectionRef["occurrences"]): NarrativeSelectionRef => ({
  id, occurrences,
});
const moment = (id: string, occurrences: NarrativeMomentRef["occurrences"]): NarrativeMomentRef => ({
  id, occurrences,
});
const frames = (value: number) => ({ unit: "frames" as const, value });
const seconds = (numerator: number, denominator = 1) => ({ unit: "seconds" as const, numerator, denominator });

test("one Selection projects exact local points and stable occurrence identity", () => {
  const result = projectSelectionWindows({
    itemId: "card",
    map,
    selection: selection("proof", [{ occurrence: 7, startAnchorId: "a", endAnchorId: "b" }]),
    space,
    expansion: { kind: "one" },
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  });
  assert.deepEqual(result, [{
    id: "card::proof#7",
    span: { startFrame: 30, endFrameExclusive: 60 },
  }]);
});

test("one Segment projects from its own structural start and end anchors", () => {
  const result = projectSegmentWindow({
    itemId: "answer-card",
    map,
    segment: { kind: "segment", id: "answer", tokenStart: 0, tokenEndExclusive: 1 },
    space,
    projection: { start: { ref: "segment.start" }, end: { ref: "segment.end" } },
  });
  assert.deepEqual(result, {
    id: "answer-card::answer",
    span: { startFrame: 60, endFrameExclusive: 120 },
  });
});

test("each preserves source order, even when physical time is reversed between occurrences", () => {
  const result = projectSelectionWindows({
    itemId: "repeat",
    map,
    selection: selection("mentions", [
      { occurrence: 4, startAnchorId: "c", endAnchorId: "d" },
      { occurrence: 9, startAnchorId: "a", endAnchorId: "b" },
    ]),
    space,
    expansion: { kind: "each" },
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  });
  assert.deepEqual(result.map((item) => item.id), ["repeat::mentions#4", "repeat::mentions#9"]);
  assert.deepEqual(result.map((item) => item.span.startFrame), [90, 30]);
});

test("strict cardinality and occurrence-invariant each fail instead of choosing or duplicating", () => {
  const repeated = selection("many", [
    { occurrence: 0, startAnchorId: "a", endAnchorId: "b" },
    { occurrence: 1, startAnchorId: "c", endAnchorId: "d" },
  ]);
  assert.throws(() => projectSelectionWindows({
    itemId: "one", map, selection: repeated, space, expansion: { kind: "one" },
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }), /exactly one occurrence/u);
  assert.throws(() => projectSelectionWindows({
    itemId: "each", map, selection: repeated, space, expansion: { kind: "each" },
    projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
  }), /occurrence-invariant/u);
});

test("negative intermediate points clip before nearest half-later frame quantization", () => {
  const result = projectMomentWindows({
    itemId: "lead",
    map,
    moment: moment("cue", [{ occurrence: 0, anchorId: "a" }]),
    space,
    expansion: { kind: "one" },
    projection: {
      start: { ref: "moment.cue", offset: seconds(-2) },
      end: { ref: "moment.cue", offset: { unit: "milliseconds", value: 550 } },
    },
  });
  assert.deepEqual(result[0]?.span, { startFrame: 0, endFrameExclusive: 47 });
});

test("program and absolute projections use exact rational frame-rate arithmetic", () => {
  const ntsc: ProgramSpace = {
    durationSec: 1.001,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  };
  const result = projectProgramWindow({
    itemId: "absolute",
    space: ntsc,
    projection: {
      start: { ref: "absolute", at: { unit: "milliseconds", value: 500 } },
      end: { ref: "absolute", at: seconds(1) },
    },
  });
  assert.deepEqual(result.span, { startFrame: 15, endFrameExclusive: 30 });
});

test("frame and authored durations enter one exact sample-boundary rule", () => {
  const ntsc: ProgramSpace = {
    durationSec: 1.001,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  };
  assert.equal(programFrameSampleBoundary(ntsc, 15, 48_000), 24_024);
  assert.equal(programSpaceSampleFrames(ntsc, 48_000), 48_048);
  assert.equal(temporalDurationInSamples(frames(15), ntsc), 24_024);
  assert.equal(temporalDurationInSamples({ unit: "milliseconds", value: 125 }, ntsc), 6_000);
  assert.equal(temporalDurationInSamples(seconds(1, 3), ntsc), 16_000);
  const twentyFour: ProgramSpace = {
    durationSec: 1,
    frameRate: { numerator: 24, denominator: 1 },
  };
  assert.equal(programFrameSampleBoundary(twentyFour, 1, 44_100), 1_838,
    "half-sample boundaries round to the later sample deterministically");
});

test("crossed source anchors are allowed until a projection actually consumes the reversal", () => {
  const crossed = selection("crossed", [{ occurrence: 0, startAnchorId: "d", endAnchorId: "a" }]);
  assert.deepEqual(locateSelectionOccurrences(map, crossed, space)[0], {
    id: "crossed#0", occurrence: 0, start: { frame: 120 }, end: { frame: 30 },
  });
  assert.throws(() => projectSelectionWindows({
    itemId: "identity", map, selection: crossed, space, expansion: { kind: "one" },
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }), /reversed raw window/u);
  assert.deepEqual(projectSelectionWindows({
    itemId: "persist", map, selection: crossed, space, expansion: { kind: "one" },
    projection: { start: { ref: "selection.start" }, end: { ref: "program.end" } },
  })[0]?.span, { startFrame: 120, endFrameExclusive: 300 });
});

test("zero, fully outside and sub-frame windows fail atomically", () => {
  assert.throws(() => projectProgramWindow({
    itemId: "zero", space,
    projection: { start: { ref: "program.start" }, end: { ref: "program.start" } },
  }), /zero raw window/u);
  assert.throws(() => projectProgramWindow({
    itemId: "outside", space,
    projection: { start: { ref: "program.end", offset: frames(1) }, end: { ref: "program.end", offset: frames(2) } },
  }), /does not intersect/u);
  assert.throws(() => projectProgramWindow({
    itemId: "tiny", space,
    projection: {
      start: { ref: "absolute", at: seconds(1, 100) },
      end: { ref: "absolute", at: seconds(7, 500) },
    },
  }), /shorter than one frame/u);
});

test("disjoint validation checks every physical overlap without reordering the result", () => {
  const occurrences = projectMomentWindows({
    itemId: "popup", map,
    moment: moment("hits", [{ occurrence: 9, anchorId: "c" }, { occurrence: 4, anchorId: "a" }]),
    space, expansion: { kind: "each" },
    projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: seconds(3) } },
  });
  assert.equal(assertWindowRelation(occurrences, "independent"), occurrences);
  assert.throws(() => assertWindowRelation(occurrences, "disjoint"), /overlap under disjoint/u);
});

test("triggered schedule derives cumulative, exclusive and settled windows from authored order", () => {
  const result = resolveTriggeredSchedule({
    outer: { startFrame: 0, endFrameExclusive: 300 },
    terminalFrame: 240,
    triggers: [{ id: "one", frame: 30 }, { id: "two", frame: 90 }, { id: "three", frame: 150 }],
  });
  assert.deepEqual(result.cumulative, [
    { startFrame: 30, endFrameExclusive: 300 },
    { startFrame: 90, endFrameExclusive: 300 },
    { startFrame: 150, endFrameExclusive: 300 },
  ]);
  assert.deepEqual(result.exclusive, [
    { startFrame: 30, endFrameExclusive: 90 },
    { startFrame: 90, endFrameExclusive: 150 },
    { startFrame: 150, endFrameExclusive: 240 },
  ]);
});

test("triggered schedule rejects equal, reversed and out-of-bound points", () => {
  const outer = { startFrame: 20, endFrameExclusive: 200 };
  assert.throws(() => resolveTriggeredSchedule({
    outer, terminalFrame: 180, triggers: [{ id: "a", frame: 40 }, { id: "b", frame: 40 }],
  }), /strictly increasing/u);
  assert.throws(() => resolveTriggeredSchedule({
    outer, terminalFrame: 180, triggers: [{ id: "a", frame: 40 }, { id: "b", frame: 30 }],
  }), /strictly increasing/u);
  assert.throws(() => resolveTriggeredSchedule({
    outer, terminalFrame: 180, triggers: [{ id: "a", frame: 180 }],
  }), /outside/u);
});
