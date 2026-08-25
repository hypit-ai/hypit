import assert from "node:assert/strict";
import test from "node:test";

import type { NarrativeMomentRef, NarrativeSelectionRef } from "@hypit/narrative";
import { programFrameSampleBoundary, programSpaceSampleFrames } from "@hypit/program-space";
import type { ProgramSpace } from "@hypit/program-space";
import { semanticTrackFixture } from "../../../test/semantic-track-fixture.js";

import {
  assertWindowRelation,
  composeTemporalWindow,
  locateSelection,
  projectMomentInstant,
  projectProgramInstant,
  projectSelectionInstant,
  projectSegmentInstant,
  resolveTriggeredSchedule,
  temporalDurationInSamples,
} from "../src/index.js";

const space: ProgramSpace = {
  id: "test-space",
  narrativeId: "test-narrative",
  durationSec: 10,
  frameRate: { numerator: 30, denominator: 1 },
};

const semantic = semanticTrackFixture(space, {
  segments: [
    { id: "opening", frameCount: 60 },
    { id: "answer", frameCount: 60 },
    { id: "ending", frameCount: 180 },
  ],
  anchors: [
    { identity: "a", frame: 30 },
    { identity: "b", frame: 60 },
    { identity: "c", frame: 90 },
    { identity: "d", frame: 120 },
    { identity: "late", frame: 240 },
    { identity: "end", frame: 300 },
    { identity: "segment:answer:start", frame: 60 },
    { identity: "segment:answer:end", frame: 120 },
  ],
});

const selection = (id: string, startAnchorId: string, endAnchorId: string): NarrativeSelectionRef => ({
  narrativeId: "test-narrative", id, startAnchorId, endAnchorId,
});
const moment = (id: string, anchorId: string): NarrativeMomentRef => ({ narrativeId: "test-narrative", id, anchorId });
const frames = (value: number) => ({ unit: "frames" as const, value });
const seconds = (numerator: number, denominator = 1) => ({ unit: "seconds" as const, numerator, denominator });
const fixed = { kind: "fixed" as const };
type Projection = import("../src/index.js").TemporalInstantExpression;
const projectProgramInstantFixture = (input: { itemId: string; semantic: typeof semantic; projection: Projection }) =>
  projectProgramInstant({ ...input, subjectId: input.itemId, authority: fixed });
const projectMomentInstantFixture = (input: { itemId: string; semantic: typeof semantic; moment: NarrativeMomentRef; projection: Projection }) =>
  projectMomentInstant({ ...input, subjectId: input.itemId, authority: fixed });
const projectSelectionInstantFixture = (input: { itemId: string; semantic: typeof semantic; selection: NarrativeSelectionRef; projection: Projection }) =>
  projectSelectionInstant({ ...input, subjectId: input.itemId, authority: fixed });
const projectSelectionWindow = (input: {
  itemId: string; semantic: typeof semantic; selection: NarrativeSelectionRef;
  projection: { start: Projection; end: Projection };
}) => composeTemporalWindow({ id: input.itemId, subjectId: input.itemId },
  projectSelectionInstant({ itemId: `${input.itemId}.start`, subjectId: input.itemId, semantic: input.semantic, selection: input.selection, projection: input.projection.start, authority: fixed }),
  input.projection.end.ref.startsWith("program.") || input.projection.end.ref === "absolute"
    ? projectProgramInstant({ itemId: `${input.itemId}.end`, subjectId: input.itemId, semantic: input.semantic, projection: input.projection.end, authority: fixed })
    : projectSelectionInstant({ itemId: `${input.itemId}.end`, subjectId: input.itemId, semantic: input.semantic, selection: input.selection, projection: input.projection.end, authority: fixed }));
const projectMomentWindow = (input: {
  itemId: string; semantic: typeof semantic; moment: NarrativeMomentRef;
  projection: { start: Projection; end: Projection };
}) => composeTemporalWindow({ id: input.itemId, subjectId: input.itemId },
  projectMomentInstant({ itemId: `${input.itemId}.start`, subjectId: input.itemId, semantic: input.semantic, moment: input.moment, projection: input.projection.start, authority: fixed }),
  projectMomentInstant({ itemId: `${input.itemId}.end`, subjectId: input.itemId, semantic: input.semantic, moment: input.moment, projection: input.projection.end, authority: fixed }));
const projectSegmentWindow = (input: {
  itemId: string; semantic: typeof semantic; segment: import("@hypit/narrative").NarrativeExcerpt;
  projection: { start: Projection; end: Projection };
}) => composeTemporalWindow({ id: input.itemId, subjectId: input.itemId },
  projectSegmentInstant({ itemId: `${input.itemId}.start`, subjectId: input.itemId, semantic: input.semantic, segment: input.segment, projection: input.projection.start, authority: fixed }),
  projectSegmentInstant({ itemId: `${input.itemId}.end`, subjectId: input.itemId, semantic: input.semantic, segment: input.segment, projection: input.projection.end, authority: fixed }));
const projectProgramWindow = (input: {
  itemId: string; semantic: typeof semantic; projection: { start: Projection; end: Projection };
}) => composeTemporalWindow({ id: input.itemId, subjectId: input.itemId },
  projectProgramInstant({ itemId: `${input.itemId}.start`, subjectId: input.itemId, semantic: input.semantic, projection: input.projection.start, authority: fixed }),
  projectProgramInstant({ itemId: `${input.itemId}.end`, subjectId: input.itemId, semantic: input.semantic, projection: input.projection.end, authority: fixed }));

test("one Selection projects exact local points and stable source identity", () => {
  const result = projectSelectionWindow({
    itemId: "card",
    semantic,
    selection: selection("proof", "a", "b"),
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  });
  assert.equal(result.id, "card");
  assert.equal(result.start.source.id, "proof");
  assert.equal(result.end.source.id, "proof");
  assert.deepEqual(result.span, { startFrame: 30, endFrameExclusive: 60 });
});

test("points preserve source identity and admit both ProgramSpace boundaries", () => {
  assert.deepEqual(projectProgramInstantFixture({
    itemId: "terminal",
    semantic,
    projection: { ref: "program.end" },
  }), {
    id: "terminal::program",
    subjectId: "terminal",
    source: { spaceId: "test-space", narrativeId: "test-narrative", kind: "program", id: "program" },
    projection: { ref: "program.end" },
    authority: fixed,
    frame: 300,
  });
  assert.deepEqual(projectMomentInstantFixture({
    itemId: "terminal",
    semantic,
    moment: moment("done", "end"),
    projection: { ref: "moment.cue" },
  }), {
    id: "terminal::done",
    subjectId: "terminal",
    source: { spaceId: "test-space", narrativeId: "test-narrative", kind: "moment", id: "done" },
    projection: { ref: "moment.cue" },
    authority: fixed,
    frame: 300,
  });
  assert.equal(projectProgramInstantFixture({
    itemId: "start",
    semantic,
    projection: { ref: "program.start" },
  }).frame, 0);
});

test("Script Program Anchors resolve through the SemanticTrack without entering a SemanticTake", () => {
  assert.deepEqual(locateSelection(semantic, selection("whole", "program:start", "program:end")), {
    id: "whole", start: { frame: 0 }, end: { frame: 300 },
  });
  assert.equal(projectMomentInstantFixture({
    itemId: "outro",
    semantic,
    moment: moment("outro", "program:end"),
    projection: { ref: "moment.cue" },
  }).frame, 300);
});

test("a point may consume one boundary of a crossed Selection", () => {
  const crossed = selection("crossed", "d", "a");
  assert.equal(projectSelectionInstantFixture({
    itemId: "boundary",
    semantic,
    selection: crossed,
    projection: { ref: "selection.end" },
  }).frame, 30);
});

test("points reject exact coordinates outside ProgramSpace", () => {
  assert.throws(() => projectProgramInstantFixture({
    itemId: "before",
    semantic,
    projection: { ref: "program.start", offset: frames(-1) },
  }), /falls outside ProgramSpace/u);
  assert.throws(() => projectProgramInstantFixture({
    itemId: "after",
    semantic,
    projection: { ref: "program.end", offset: frames(1) },
  }), /falls outside ProgramSpace/u);
});

test("one Segment projects from its own structural start and end anchors", () => {
  const result = projectSegmentWindow({
    itemId: "answer-card",
    semantic,
    segment: { kind: "segment", narrativeId: "test-narrative", id: "answer", tokenStart: 0, tokenEndExclusive: 1 },
    projection: { start: { ref: "segment.start" }, end: { ref: "segment.end" } },
  });
  assert.equal(result.id, "answer-card");
  assert.equal(result.start.source.id, "answer");
  assert.equal(result.end.source.id, "answer");
  assert.deepEqual(result.span, { startFrame: 60, endFrameExclusive: 120 });
});

test("Instant endpoints outside ProgramSpace are rejected before Window composition", () => {
  assert.throws(() => projectMomentWindow({
    itemId: "lead",
    semantic,
    moment: moment("cue", "a"),
    projection: {
      start: { ref: "moment.cue", offset: seconds(-2) },
      end: { ref: "moment.cue", offset: { unit: "milliseconds", value: 550 } },
    },
  }), /falls outside ProgramSpace/u);
});

test("program and absolute projections use exact rational frame-rate arithmetic", () => {
  const ntsc: ProgramSpace = {
    id: "test-space", narrativeId: "test-narrative",
    durationSec: 1.001,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  };
  const result = projectProgramWindow({
    itemId: "absolute",
    semantic: semanticTrackFixture(ntsc),
    projection: {
      start: { ref: "absolute", at: { unit: "milliseconds", value: 500 } },
      end: { ref: "absolute", at: seconds(1) },
    },
  });
  assert.deepEqual(result.span, { startFrame: 15, endFrameExclusive: 30 });
});

test("frame and authored durations enter one exact sample-boundary rule", () => {
  const ntsc: ProgramSpace = {
    id: "test-space", narrativeId: "test-narrative",
    durationSec: 1.001,
    frameRate: { numerator: 30_000, denominator: 1_001 },
  };
  assert.equal(programFrameSampleBoundary(ntsc, 15, 48_000), 24_024);
  assert.equal(programSpaceSampleFrames(ntsc, 48_000), 48_048);
  assert.equal(temporalDurationInSamples(frames(15), ntsc), 24_024);
  assert.equal(temporalDurationInSamples({ unit: "milliseconds", value: 125 }, ntsc), 6_000);
  assert.equal(temporalDurationInSamples(seconds(1, 3), ntsc), 16_000);
  const twentyFour: ProgramSpace = {
    id: "test-space", narrativeId: "test-narrative",
    durationSec: 1,
    frameRate: { numerator: 24, denominator: 1 },
  };
  assert.equal(programFrameSampleBoundary(twentyFour, 1, 44_100), 1_838,
    "half-sample boundaries round to the later sample deterministically");
});

test("crossed source anchors are allowed until a projection actually consumes the reversal", () => {
  const crossed = selection("crossed", "d", "a");
  assert.deepEqual(locateSelection(semantic, crossed), {
    id: "crossed", start: { frame: 120 }, end: { frame: 30 },
  });
  assert.throws(() => projectSelectionWindow({
    itemId: "identity", semantic, selection: crossed,
    projection: { start: { ref: "selection.start" }, end: { ref: "selection.end" } },
  }), /endpoints are reversed/u);
  assert.deepEqual(projectSelectionWindow({
    itemId: "persist", semantic, selection: crossed,
    projection: { start: { ref: "selection.start" }, end: { ref: "program.end" } },
  }).span, { startFrame: 120, endFrameExclusive: 300 });
});

test("zero, fully outside and sub-frame windows fail atomically", () => {
  assert.throws(() => projectProgramWindow({
    itemId: "zero", semantic,
    projection: { start: { ref: "program.start" }, end: { ref: "program.start" } },
  }), /zero window/u);
  assert.throws(() => projectProgramWindow({
    itemId: "outside", semantic,
    projection: { start: { ref: "program.end", offset: frames(1) }, end: { ref: "program.end", offset: frames(2) } },
  }), /falls outside ProgramSpace/u);
  assert.throws(() => projectProgramWindow({
    itemId: "tiny", semantic,
    projection: {
      start: { ref: "absolute", at: seconds(1, 100) },
      end: { ref: "absolute", at: seconds(7, 500) },
    },
  }), /zero window/u);
});

test("disjoint validation checks physical overlap without reordering the input", () => {
  const windows = [
    projectMomentWindow({
      itemId: "later", semantic, moment: moment("later", "c"),
      projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: seconds(3) } },
    }),
    projectMomentWindow({
      itemId: "earlier", semantic, moment: moment("earlier", "a"),
      projection: { start: { ref: "moment.cue" }, end: { ref: "moment.cue", offset: seconds(3) } },
    }),
  ];
  assert.equal(assertWindowRelation(windows, "independent"), windows);
  assert.throws(() => assertWindowRelation(windows, "disjoint"), /overlap under disjoint/u);
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
