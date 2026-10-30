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
  createTemporalMapEvaluator,
  evaluateTemporalMap,
  exactTemporalValueFromFrames,
  identityTemporalMap,
  integrateTemporalRateProfile,
  moduloExactTemporalValue,
  projectDomainPosition,
  projectProgramInstant,
  parseTemporalRelationFields,
  parseTemporalCubicRelationFields,
  resolveTemporalBoundary,
  resolveTemporalRelation,
  sealTemporalMap,
  resolveTriggeredSchedule,
  temporalDurationInSamples,
  temporalExtentFromDomain,
} from "../src/index.js";

const timeline: Timeline = { id: "film", frameRate: { numerator: 30, denominator: 1 }, frameCount: 300 };
const frames = (value: number) => ({ unit: "frames" as const, value });
const seconds = (numerator: number, denominator = 1) => ({ unit: "seconds" as const, numerator, denominator });
const instant = (id: string, projection: import("../src/index.js").TemporalInstantExpression) =>
  projectProgramInstant({ itemId: id, subjectId: "subject", timeline, projection });

test("Temporal relation literals are parsed without a Frontend", () => {
  assert.deepEqual(parseTemporalRelationFields({
    "target-at": "end",
    "source-at": "end",
    rate: "1.5",
    "wrap-from": "start+250ms",
    "wrap-until": "end-250ms",
  }, "Map"), {
    kind: "rate",
    target: { from: { edge: "start", offset: seconds(0) }, until: { edge: "end", offset: seconds(0) } },
    targetAt: { edge: "end", offset: seconds(0) },
    sourceAt: { edge: "end", offset: seconds(0) },
    rate: { numerator: 3, denominator: 2 },
    source: { from: { edge: "start", offset: seconds(0) }, until: { edge: "end", offset: seconds(0) } },
    wrap: {
      from: { edge: "start", offset: { unit: "milliseconds", value: 250 } },
      until: { edge: "end", offset: { unit: "milliseconds", value: 250 } },
    },
  });
});

test("cubic relation literals name source positions without encoding an editor easing mode", () => {
  assert.deepEqual(parseTemporalCubicRelationFields({
    "target-from": "start", "target-until": "end",
    "source-at-start": "start", "source-control-1": "start+250ms",
    "source-control-2": "end-250ms", "source-at-end": "end",
  }, "Curve"), {
    kind: "cubic",
    target: { from: { edge: "start", offset: seconds(0) }, until: { edge: "end", offset: seconds(0) } },
    sourceAtStart: { edge: "start", offset: seconds(0) },
    sourceControl1: { edge: "start", offset: { unit: "milliseconds", value: 250 } },
    sourceControl2: { edge: "end", offset: { unit: "milliseconds", value: 250 } },
    sourceAtEnd: { edge: "end", offset: seconds(0) },
  });
});

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
  assert.deepEqual(evaluateTemporalMap(map,
    { ticks: "1", timeBase: { numerator: 1, denominator: 2 } }, "after"), {
    position: { ticks: "7", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "before",
  });
  assert.equal(evaluateTemporalMap(map,
    { ticks: "5", timeBase: { numerator: 1, denominator: 4 } }, "after"), undefined);
  assert.deepEqual(evaluateTemporalMap(map,
    { ticks: "2", timeBase: { numerator: 1, denominator: 1 } }, "after"), {
    position: { ticks: "4", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "after",
  });
  assert.deepEqual(evaluateTemporalMap(map,
    { ticks: "7", timeBase: { numerator: 1, denominator: 2 } }, "after"), {
    position: { ticks: "1", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "after",
  });
  assert.deepEqual(evaluateTemporalMap(identityTemporalMap(target), target.duration, "before"), {
    position: target.duration, sourceSide: "before",
  });
});

test("sided evaluation keeps gaps half-open and carries side through composed stages", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const parent = { id: "parent", duration: value("4") };
  const child = { id: "child", duration: value("4") };
  const source = { id: "source", duration: value("4") };
  const reverse = sealTemporalMap({ stages: [{ target: parent, source: child, pieces: [{
    target: { start: value("0"), end: parent.duration },
    sourceAtStart: child.duration,
    rate: { numerator: -1, denominator: 1 },
  }] }] });
  const heldFrames = sealTemporalMap({ stages: [{ target: child, source, pieces: [0, 1, 2, 3].map((frame) => ({
    target: { start: value(String(frame)), end: value(String(frame + 1)) },
    sourceAtStart: value(String(frame)),
    rate: { numerator: 0, denominator: 1 },
  })) }] });
  const sampled = evaluateTemporalMap(composeTemporalMaps(reverse, heldFrames), value("0"), "after");
  assert.deepEqual(sampled, { position: value("3"), sourceSide: "after" });
  const media = { id: "media", duration: value("4") };
  const childReverse = sealTemporalMap({ stages: [{ target: source, source: media, pieces: [{
    target: { start: value("0"), end: source.duration },
    sourceAtStart: media.duration,
    rate: { numerator: -1, denominator: 1 },
  }] }] });
  assert.deepEqual(evaluateTemporalMap(
    composeTemporalMaps(composeTemporalMaps(reverse, heldFrames), childReverse), value("0"), "after"),
  { position: value("1"), sourceSide: "before" },
    "a frame hold resets boundary ownership without erasing the child source relation's direction");

  const partial = sealTemporalMap({ stages: [{ target: parent, source, pieces: [{
    target: { start: value("0"), end: value("2") },
    sourceAtStart: value("0"),
    rate: { numerator: 1, denominator: 1 },
  }] }] });
  assert.deepEqual(evaluateTemporalMap(partial, value("2"), "before"), {
    position: value("2"), sourceSide: "before",
  }, "the side before an exclusive boundary still belongs to the ending piece");
  assert.equal(evaluateTemporalMap(partial, value("2"), "after"), undefined,
    "the side after an exclusive boundary must not extend content into a gap");

  const cut = sealTemporalMap({ stages: [{ target: parent, source, pieces: [
    { target: { start: value("0"), end: value("2") }, sourceAtStart: value("0"),
      rate: { numerator: 1, denominator: 1 } },
    { target: { start: value("2"), end: value("4") }, sourceAtStart: value("1"),
      rate: { numerator: 1, denominator: 1 } },
  ] }] });
  assert.deepEqual(evaluateTemporalMap(cut, value("2"), "before"), {
    position: value("2"), sourceSide: "before",
  }, "the side before a jump follows the ending piece");
  assert.deepEqual(evaluateTemporalMap(cut, value("2"), "after"), {
    position: value("1"), sourceSide: "after",
  }, "the side after a jump follows the beginning piece");
});

test("a bound Temporal Map evaluator preserves the one-shot sided semantics", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const target = { id: "bound-target", duration: value("4") };
  const source = { id: "bound-source", duration: value("4") };
  const map = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: value("3") },
    sourceAtStart: value("3"), rate: { numerator: -1, denominator: 1 },
  }] }] });
  const evaluate = createTemporalMapEvaluator(map);
  for (const side of ["before", "after"] as const) for (const at of [value("0"), value("2"), value("3")]) {
    assert.deepEqual(evaluate(at, side), evaluateTemporalMap(map, at, side));
  }
});

test("cubic Map pieces evaluate exact monotone source positions without a curve registry", () => {
  const value = (ticks: string, denominator = 1) => ({ ticks, timeBase: { numerator: 1, denominator } });
  const target = { id: "ramp", duration: value("4") };
  const source = { id: "footage", duration: value("10") };
  const map = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: target.duration },
    sourceAtStart: value("0"),
    sourceControl1: value("0"),
    sourceControl2: value("8"),
    sourceAtEnd: value("8"),
  }] }] });
  assert.deepEqual(evaluateTemporalMap(map, value("1"), "after"), {
    position: value("5", 4), sourceSide: "after",
  });
  assert.deepEqual(evaluateTemporalMap(map, value("2"), "after"), {
    position: value("4"), sourceSide: "after",
  });
  assert.throws(() => sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: target.duration },
    sourceAtStart: value("0"), sourceControl1: value("8"), sourceControl2: value("2"), sourceAtEnd: value("6"),
  }] }] }), /controls must be monotone/u);
});

test("a signed rate profile integrates to one exact cubic target-to-source Map", () => {
  const value = (ticks: string, denominator = 1) => ({ ticks, timeBase: { numerator: 1, denominator } });
  const source = { id: "footage", duration: value("10") };
  const map = integrateTemporalRateProfile({
    targetId: "ramped",
    source,
    knots: [
      { sourceAt: value("0"), rate: { numerator: 1, denominator: 1 } },
      { sourceAt: value("5"), rate: { numerator: 1, denominator: 2 } },
      { sourceAt: value("10"), rate: { numerator: 1, denominator: 1 } },
    ],
  });
  assert.deepEqual(map.stages[0]?.target.duration, value("40", 3));
  assert.deepEqual(evaluateTemporalMap(map, value("20", 3), "after"), {
    position: value("5"), sourceSide: "after",
  });
  assert.deepEqual(evaluateTemporalMap(map, value("40", 3), "before"), {
    position: value("10"), sourceSide: "before",
  });
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
  assert.deepEqual(evaluateTemporalMap(map,
    { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }, "after"), {
    position: source.duration, sourceSide: "before",
  });
  assert.deepEqual(evaluateTemporalMap(map,
    { ticks: "1", timeBase: { numerator: 1, denominator: 1 } }, "after"), {
    position: { ticks: "3", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "before",
  });
  assert.deepEqual(evaluateTemporalMap(map, target.duration, "before"), {
    position: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } }, sourceSide: "after",
  });
});

test("a wrap seam is represented by its source side instead of the rate sign", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const target = { id: "occurrence", duration: value("4") };
  const source = { id: "source", duration: value("4") };
  const wrapped = (rate: 1 | -1) => sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: target.duration },
    sourceAtStart: rate > 0 ? value("0") : source.duration,
    rate: { numerator: rate, denominator: 1 },
    wrap: { start: value("0"), end: source.duration },
  }] }] });
  assert.deepEqual(evaluateTemporalMap(wrapped(1), target.duration, "before"), {
    position: source.duration, sourceSide: "before",
  });
  assert.deepEqual(evaluateTemporalMap(wrapped(-1), target.duration, "before"), {
    position: value("0"), sourceSide: "after",
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
  assert.deepEqual(evaluateTemporalMap(reverse, oneSecond, "after"), {
    position: oneSecond, sourceSide: "before",
  });
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
