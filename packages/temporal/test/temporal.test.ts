import assert from "node:assert/strict";
import test from "node:test";

import { timelineFrameSampleBoundary, timelineSampleFrames } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

import {
  assertTemporalInstantFor,
  assertDomainWindow,
  assertTemporalWindowFor,
  assertWindowRelation,
  composeTemporalWindow,
  composeTemporalMaps,
  evaluateTemporalMap,
  exactTemporalValueFromFrames,
  identityTemporalMap,
  moduloExactTemporalValue,
  projectDomainPosition,
  projectProgramInstant,
  resolveTemporalBoundary,
  resolveTemporalRelation,
  sealTemporalMap,
  temporalMapDirectionAt,
  resolveTriggeredSchedule,
  temporalDurationInSamples,
  temporalExtentFromDomain,
} from "../src/index.js";

const timeline: Timeline = { id: "film", frameRate: { numerator: 30, denominator: 1 }, frameCount: 300 };
const frames = (value: number) => ({ unit: "frames" as const, value });
const seconds = (numerator: number, denominator = 1) => ({ unit: "seconds" as const, numerator, denominator });
const instant = (id: string, projection: import("../src/index.js").TemporalInstantExpression) =>
  projectProgramInstant({ itemId: id, subjectId: "subject", timeline, projection });

test("TemporalExtent preserves an exact unpositioned duration without owning a Clock", () => {
  const extent = temporalExtentFromDomain({
    id: "voice-local", duration: exactTemporalValueFromFrames(90, timeline),
  });
  assert.deepEqual(extent, { duration: { ticks: "3", timeBase: { numerator: 1, denominator: 1 } } });
  assert.equal(resolveTemporalBoundary(extent.duration, timeline, "exact"), 90);
  assert.equal(resolveTemporalBoundary(extent.duration,
    { frameRate: { numerator: 24, denominator: 1 } }, "exact"), 72);
});

test("exact temporal modulo preserves phase without choosing a frame grid", () => {
  const halfSecond = { ticks: "1", timeBase: { numerator: 1, denominator: 2 } };
  assert.deepEqual(moduloExactTemporalValue(
    { ticks: "2", timeBase: { numerator: 1, denominator: 3 } }, halfSecond,
  ), { ticks: "1", timeBase: { numerator: 1, denominator: 6 } });
  assert.deepEqual(moduloExactTemporalValue(
    { ticks: "-1", timeBase: { numerator: 1, denominator: 3 } }, halfSecond,
  ), { ticks: "1", timeBase: { numerator: 1, denominator: 6 } });
});

test("one domain projector resolves exact local positions only after placement", () => {
  const domain = { id: "voice-local", duration: exactTemporalValueFromFrames(90, timeline) };
  const start = instant("voice.start", { ref: "absolute", at: frames(150) });
  const end = instant("voice.end", { ref: "absolute", at: frames(240) });
  const window = composeTemporalWindow({ id: "voice", subjectId: "voice" }, start, end);
  assert.doesNotThrow(() => assertDomainWindow(domain, window, timeline));
  assert.equal(projectDomainPosition(domain, window, timeline, exactTemporalValueFromFrames(0, timeline)), 150);
  assert.equal(projectDomainPosition(domain, window, timeline, domain.duration), 240);
});

test("domain projection uses explicit boundary policy and rejects positions outside the domain", () => {
  const domain = { id: "voice-local", duration: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } } };
  const start = instant("voice.start", { ref: "absolute", at: frames(30) });
  const end = instant("voice.end", { ref: "absolute", at: frames(90) });
  const window = composeTemporalWindow({ id: "voice", subjectId: "voice" }, start, end);
  assert.doesNotThrow(() => assertDomainWindow(domain, window, timeline));
  const short = composeTemporalWindow({ id: "short", subjectId: "voice" }, start,
    instant("short.end", { ref: "absolute", at: frames(89) }));
  assert.throws(() => assertDomainWindow(domain, short, timeline), /does not cover/u);
  assert.throws(() => projectDomainPosition(domain, window, timeline,
    { ticks: "-1", timeBase: { numerator: 1, denominator: 30 } }), /outside local temporal domain/u);
  assert.throws(() => projectDomainPosition(domain, window, timeline,
    { ticks: "61", timeBase: { numerator: 1, denominator: 30 } }), /outside local temporal domain/u);
});

test("boundary policies are explicit for exact durations that do not land on a frame", () => {
  const value = { ticks: "1", timeBase: { numerator: 1, denominator: 10 } };
  const ntsc = { frameRate: { numerator: 30_000, denominator: 1_001 } };
  assert.throws(() => resolveTemporalBoundary(value, ntsc, "exact"), /does not fall exactly/u);
  assert.equal(resolveTemporalBoundary(value, ntsc, "inside"), 2);
  assert.equal(resolveTemporalBoundary(value, ntsc, "nearest"), 3);
  assert.equal(resolveTemporalBoundary(value, ntsc, "cover"), 3);
});

test("Temporal Maps compose identity, scale, reverse, hold, loop and gaps without a central registry", () => {
  const target = { id: "target", duration: { ticks: "4", timeBase: { numerator: 1, denominator: 1 } } };
  const middle = { id: "middle", duration: { ticks: "8", timeBase: { numerator: 1, denominator: 1 } } };
  const source = { id: "source", duration: { ticks: "10", timeBase: { numerator: 1, denominator: 1 } } };
  const first = sealTemporalMap({ stages: [{
    target, source: middle, pieces: [{
      target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: target.duration },
      sourceAtStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, rate: { numerator: 2, denominator: 1 },
    }],
  }] });
  const second = sealTemporalMap({ stages: [{
    target: middle, source, pieces: [
      { target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } } },
        sourceAtStart: { ticks: "8", timeBase: { numerator: 1, denominator: 1 } }, rate: { numerator: -1, denominator: 1 } },
      { target: { start: { ticks: "3", timeBase: { numerator: 1, denominator: 1 } }, end: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } } },
        sourceAtStart: { ticks: "4", timeBase: { numerator: 1, denominator: 1 } }, rate: { numerator: 0, denominator: 1 } },
      { target: { start: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } }, end: middle.duration },
        sourceAtStart: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } }, rate: { numerator: 1, denominator: 1 },
        wrap: { start: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } }, end: { ticks: "3", timeBase: { numerator: 1, denominator: 1 } } } },
    ],
  }] });
  const map = composeTemporalMaps(first, second);
  assert.deepEqual(evaluateTemporalMap(map, { ticks: "1", timeBase: { numerator: 1, denominator: 2 } }),
    { ticks: "7", timeBase: { numerator: 1, denominator: 1 } });
  assert.equal(evaluateTemporalMap(map, { ticks: "5", timeBase: { numerator: 1, denominator: 4 } }), undefined);
  assert.deepEqual(evaluateTemporalMap(map, { ticks: "2", timeBase: { numerator: 1, denominator: 1 } }),
    { ticks: "4", timeBase: { numerator: 1, denominator: 1 } });
  assert.deepEqual(evaluateTemporalMap(map, { ticks: "7", timeBase: { numerator: 1, denominator: 2 } }),
    { ticks: "1", timeBase: { numerator: 1, denominator: 1 } });
  assert.deepEqual(evaluateTemporalMap(identityTemporalMap(target), target.duration), target.duration);
});

test("a reverse wrapped Map preserves the left-hand representative at its cyclic boundary", () => {
  const target = { id: "occurrence", duration: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } } };
  const source = { id: "source", duration: { ticks: "4", timeBase: { numerator: 1, denominator: 1 } } };
  const map = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: target.duration },
    sourceAtStart: source.duration,
    rate: { numerator: -1, denominator: 1 },
    wrap: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, end: source.duration },
  }] }] });
  assert.deepEqual(evaluateTemporalMap(map, { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }),
    source.duration);
  assert.equal(temporalMapDirectionAt(map, { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }), -1);
  assert.deepEqual(evaluateTemporalMap(map, { ticks: "1", timeBase: { numerator: 1, denominator: 1 } }), {
    ticks: "3", timeBase: { numerator: 1, denominator: 1 },
  });
  assert.deepEqual(evaluateTemporalMap(map, target.duration), {
    ticks: "2", timeBase: { numerator: 1, denominator: 1 },
  });
});

test("one relation resolver binds edge-relative author intent to exact domains", () => {
  const target = { id: "occurrence", duration: { ticks: "4", timeBase: { numerator: 1, denominator: 1 } } };
  const source = { id: "prepared", duration: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } } };
  const partial = resolveTemporalRelation({ target, source, clock: timeline });
  assert.deepEqual(partial.stages[0]?.pieces[0], {
    target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      end: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } } },
    sourceAtStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    rate: { numerator: 1, denominator: 1 },
  });
  const reverse = resolveTemporalRelation({ target: source, source, clock: timeline, spec: { relations: [{
    kind: "rate",
    target: { from: { edge: "start", offset: seconds(0) }, until: { edge: "end", offset: seconds(0) } },
    targetAt: { edge: "start", offset: seconds(0) },
    sourceAt: { edge: "end", offset: seconds(0) },
    rate: { numerator: -1, denominator: 1 },
    source: { from: { edge: "start", offset: seconds(0) }, until: { edge: "end", offset: seconds(0) } },
  }] } });
  assert.deepEqual(reverse.stages[0]?.pieces[0]?.sourceAtStart, source.duration);
  const oneSecond = { ticks: "1", timeBase: { numerator: 1, denominator: 1 } } as const;
  assert.deepEqual(evaluateTemporalMap(reverse, oneSecond), oneSecond);
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
