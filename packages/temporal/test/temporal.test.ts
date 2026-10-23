import assert from "node:assert/strict";
import test from "node:test";

import { timelineFrameSampleBoundary, timelineSampleFrames } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

import {
  assertTemporalExtentClock,
  assertTemporalInstantFor,
  assertExactDomainWindow,
  assertTemporalWindowFor,
  assertWindowRelation,
  composeTemporalWindow,
  projectDomainFrame,
  projectProgramInstant,
  resolveTriggeredSchedule,
  temporalDurationInSamples,
  temporalExtentFromDomain,
} from "../src/index.js";

const timeline: Timeline = { id: "film", frameRate: { numerator: 30, denominator: 1 }, frameCount: 300 };
const frames = (value: number) => ({ unit: "frames" as const, value });
const seconds = (numerator: number, denominator = 1) => ({ unit: "seconds" as const, numerator, denominator });
const instant = (id: string, projection: import("../src/index.js").TemporalInstantExpression) =>
  projectProgramInstant({ itemId: id, subjectId: "subject", timeline, projection });

test("TemporalExtent preserves only unpositioned length and Clock", () => {
  const extent = temporalExtentFromDomain({
    id: "voice-local", frameRate: timeline.frameRate, frameCount: 90,
  });
  assert.deepEqual(extent, { frameRate: timeline.frameRate, frameCount: 90 });
  assert.doesNotThrow(() => assertTemporalExtentClock(extent, timeline));
  assert.throws(() => assertTemporalExtentClock(extent, {
    ...timeline, frameRate: { numerator: 24, denominator: 1 },
  }), /selected Clock/u);
});

test("one domain projector is a total exact translation of one complete local domain", () => {
  const domain = { id: "voice-local", frameRate: timeline.frameRate, frameCount: 90 };
  const start = instant("voice.start", { ref: "absolute", at: frames(150) });
  const end = instant("voice.end", { ref: "absolute", at: frames(240) });
  const window = composeTemporalWindow({ id: "voice", subjectId: "voice" }, start, end);
  assert.doesNotThrow(() => assertExactDomainWindow(domain, window, timeline));
  assert.equal(projectDomainFrame(domain, window, timeline, 0), 150);
  assert.equal(projectDomainFrame(domain, window, timeline, 90), 240);
});

test("domain projection rejects incompatible Clocks, unequal Windows and invalid local frames", () => {
  const domain = { id: "voice-local", frameRate: { numerator: 24, denominator: 1 }, frameCount: 48 };
  const start = instant("voice.start", { ref: "absolute", at: frames(30) });
  const end = instant("voice.end", { ref: "absolute", at: frames(78) });
  const window = composeTemporalWindow({ id: "voice", subjectId: "voice" }, start, end);
  assert.throws(() => assertExactDomainWindow(domain, window, timeline), /not normalized/u);
  const normalized = { ...domain, frameRate: timeline.frameRate };
  const short = composeTemporalWindow({ id: "short", subjectId: "voice" }, start,
    instant("short.end", { ref: "absolute", at: frames(77) }));
  assert.throws(() => assertExactDomainWindow(normalized, short, timeline), /does not cover/u);
  assert.throws(() => projectDomainFrame(normalized, window, timeline, -1), /outside local temporal domain/u);
  assert.throws(() => projectDomainFrame(normalized, window, timeline, 49), /outside local temporal domain/u);
});

test("Timeline and absolute expressions resolve to minimal absolute Instants", () => {
  assert.deepEqual(instant("start", { ref: "timeline.start" }), {
    id: "start", subjectId: "subject", timelineId: "film", frame: 0,
  });
  assert.deepEqual(instant("end", { ref: "timeline.end" }), {
    id: "end", subjectId: "subject", timelineId: "film", frame: 300,
  });
  assert.equal(instant("absolute", { ref: "absolute", at: seconds(5, 2), offset: frames(8) }).frame, 83);
});

test("Instant projection uses exact rational clock arithmetic and rejects out-of-range points", () => {
  const ntsc: Timeline = { id: "ntsc", frameRate: { numerator: 30_000, denominator: 1_001 }, frameCount: 30 };
  assert.equal(projectProgramInstant({ itemId: "half", subjectId: "half", timeline: ntsc,
    projection: { ref: "absolute", at: { unit: "milliseconds", value: 500 } } }).frame, 15);
  assert.throws(() => instant("before", { ref: "timeline.start", offset: frames(-1) }), /falls outside Timeline/u);
  assert.throws(() => instant("after", { ref: "timeline.end", offset: frames(1) }), /falls outside Timeline/u);
});

test("Window composition keeps its own identity while accepting independent endpoint origins", () => {
  const start = projectProgramInstant({ itemId: "reveal", subjectId: "semantic.reveal", timeline,
    projection: { ref: "absolute", at: frames(30) } });
  const end = projectProgramInstant({ itemId: "answer-end", subjectId: "semantic.answer-end", timeline,
    projection: { ref: "absolute", at: frames(90) } });
  const window = composeTemporalWindow({ id: "window", subjectId: "authored.reveal-band" }, start, end);
  assert.deepEqual(window, {
    id: "window",
    subjectId: "authored.reveal-band",
    start,
    end,
    span: { startFrame: 30, endFrameExclusive: 90 },
  });
  assert.doesNotThrow(() => assertTemporalWindowFor(window, { timeline }));
  assert.throws(() => composeTemporalWindow({ id: "zero", subjectId: "subject" }, start, start), /zero window/u);
  assert.throws(() => composeTemporalWindow({ id: "reverse", subjectId: "subject" }, end, start), /reversed/u);
});

test("resolved Instants validate only absolute execution identity", () => {
  const value = instant("point", { ref: "absolute", at: frames(40) });
  assert.doesNotThrow(() => assertTemporalInstantFor(value, { timeline }));
  assert.throws(() => assertTemporalInstantFor(value, { timeline: { ...timeline, id: "other" } }), /different Timeline/u);
});

test("frame and authored durations enter one exact sample-boundary rule", () => {
  const ntsc: Timeline = { id: "ntsc", frameRate: { numerator: 30_000, denominator: 1_001 }, frameCount: 30 };
  assert.equal(timelineFrameSampleBoundary(ntsc, 15, 48_000), 24_024);
  assert.equal(timelineSampleFrames(ntsc, 48_000), 48_048);
  assert.equal(temporalDurationInSamples(frames(15), ntsc), 24_024);
  assert.equal(temporalDurationInSamples({ unit: "milliseconds", value: 125 }, ntsc), 6_000);
  assert.equal(temporalDurationInSamples(seconds(1, 3), ntsc), 16_000);
});

test("disjoint validation checks physical overlap without reordering input", () => {
  const window = (id: string, start: number, end: number) => composeTemporalWindow({ id, subjectId: "subject" },
    instant(`${id}.start`, { ref: "absolute", at: frames(start) }),
    instant(`${id}.end`, { ref: "absolute", at: frames(end) }));
  const windows = [window("later", 90, 180), window("earlier", 30, 120)];
  assert.equal(assertWindowRelation(windows, "independent"), windows);
  assert.throws(() => assertWindowRelation(windows, "disjoint"), /overlap under disjoint/u);
});

test("triggered schedule derives cumulative and exclusive windows from authored order", () => {
  const result = resolveTriggeredSchedule({ outer: { startFrame: 0, endFrameExclusive: 300 }, terminalFrame: 240,
    triggers: [{ id: "one", frame: 30 }, { id: "two", frame: 90 }, { id: "three", frame: 150 }] });
  assert.deepEqual(result.cumulative, [
    { startFrame: 30, endFrameExclusive: 300 }, { startFrame: 90, endFrameExclusive: 300 }, { startFrame: 150, endFrameExclusive: 300 },
  ]);
  assert.deepEqual(result.exclusive, [
    { startFrame: 30, endFrameExclusive: 90 }, { startFrame: 90, endFrameExclusive: 150 }, { startFrame: 150, endFrameExclusive: 240 },
  ]);
  assert.throws(() => resolveTriggeredSchedule({ outer: { startFrame: 20, endFrameExclusive: 200 }, terminalFrame: 180,
    triggers: [{ id: "a", frame: 40 }, { id: "b", frame: 40 }] }), /strictly increasing/u);
});
