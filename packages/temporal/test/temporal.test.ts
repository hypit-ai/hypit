import assert from "node:assert/strict";
import test from "node:test";

import {
  composeTemporalMaps,
  createTemporalMapEvaluator,
  evaluateTemporalMap,
  exactTemporalValueFromExtent,
  exactTemporalValueFromFrames,
  frameSampleBoundary,
  frameSpanSamples,
  identityTemporalMap,
  integrateTemporalRateProfile,
  moduloExactTemporalValue,
  parseTemporalRelationFields,
  parseTemporalCubicRelationFields,
  preimageTemporalMap,
  preimageTemporalMapRegions,
  resolveTemporalBoundary,
  resolveExactTemporalRelation,
  resolveTemporalRelation,
  sealTemporalMap,
  temporalDurationInSamples,
  temporalExtentFromDomain,
  temporalMapMayContain,
  temporalMapPointRegionSet,
  uniqueTemporalMapRegionSetPoint,
} from "../src/index.js";

const timeline = { id: "film", frameRate: { numerator: 30, denominator: 1 }, frameCount: 300 };
const frames = (value: number) => ({ unit: "frames" as const, value });
const seconds = (numerator: number, denominator = 1) => ({ unit: "seconds" as const, numerator, denominator });

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
  assert.deepEqual(exactTemporalValueFromExtent(extent), extent.duration);
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

test("structural content discovery follows composed support without sampling a Clock", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const target = { id: "target-support", duration: value("4") };
  const middle = { id: "middle-support", duration: value("4") };
  const source = { id: "source-support", duration: value("4") };
  const first = identityTemporalMap(target);
  const renamed = sealTemporalMap({ stages: [{ target, source: middle, pieces: first.stages[0]!.pieces }] });
  const sparse = sealTemporalMap({ stages: [{ target: middle, source, pieces: [{
    target: { start: value("2"), end: value("3") },
    sourceAtStart: value("0"), rate: { numerator: 1, denominator: 1 },
  }] }] });
  const map = composeTemporalMaps(renamed, sparse);
  assert.equal(temporalMapMayContain(map, { start: value("0"), end: value("2") }), false);
  assert.equal(temporalMapMayContain(map, { start: value("2"), end: value("3") }), true);
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

test("one clock-free occurrence relation closes trim, hold and loop into one Map stage", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const point = (ticks: string) => ({ edge: "start" as const, offset: value(ticks) });
  const target = { id: "occurrence-relation", duration: value("6") };
  const source = { id: "source-relation", duration: value("10") };
  const fullSource = { from: point("0"), until: point("10") };
  const map = resolveExactTemporalRelation({ target, source, spec: { relations: [
    { kind: "rate", target: { from: point("0"), until: point("2") },
      targetAt: point("0"), sourceAt: point("1"), rate: { numerator: 1, denominator: 1 },
      source: fullSource },
    { kind: "rate", target: { from: point("2"), until: point("4") },
      targetAt: point("2"), sourceAt: point("5"), rate: { numerator: 0, denominator: 1 },
      source: fullSource },
    { kind: "rate", target: { from: point("4"), until: point("6") },
      targetAt: point("4"), sourceAt: point("0"), rate: { numerator: 1, denominator: 1 },
      source: fullSource, wrap: { from: point("0"), until: point("2") } },
  ] } });
  assert.equal(map.stages.length, 1);
  assert.deepEqual(evaluateTemporalMap(map, value("1"), "after")?.position, value("2"));
  assert.deepEqual(evaluateTemporalMap(map, value("3"), "after")?.position, value("5"));
  assert.deepEqual(evaluateTemporalMap(map, value("5"), "after")?.position, value("1"));
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
  const partial = resolveTemporalRelation({ target, source, grid: timeline });
  assert.deepEqual(partial.stages[0]?.pieces[0], {
    target: { start: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
      end: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } } },
    sourceAtStart: { ticks: "0", timeBase: { numerator: 1, denominator: 1 } },
    rate: { numerator: 1, denominator: 1 },
  });
  const reverse = resolveTemporalRelation({ target: source, source, grid: timeline, spec: { relations: [{
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

test("frame and authored durations enter one exact sample-boundary rule", () => {
  const ntsc = { frameRate: { numerator: 30_000, denominator: 1_001 } };
  assert.equal(frameSampleBoundary(ntsc, 15, 48_000), 24_024);
  assert.equal(frameSpanSamples({ startFrame: 0, endFrameExclusive: 30 }, ntsc, 48_000).sampleFrames, 48_048);
  assert.equal(temporalDurationInSamples(frames(15), ntsc), 24_024);
  assert.equal(temporalDurationInSamples({ unit: "milliseconds", value: 125 }, ntsc), 6_000);
  assert.equal(temporalDurationInSamples(seconds(1, 3), ntsc), 16_000);
});

test("Temporal Map preimage returns every exact loop solution without sampling time", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const target = { id: "loop-occurrence", duration: value("4") };
  const source = { id: "loop-source", duration: value("2") };
  const map = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: target.duration },
    sourceAtStart: value("0"), rate: { numerator: 1, denominator: 1 },
    wrap: { start: value("0"), end: source.duration },
  }] }] });
  const anchor = { position: value("1"), side: "after" as const };
  assert.deepEqual(preimageTemporalMap(map, { start: anchor, end: anchor }), {
    domain: target,
    regions: [value("1"), value("3")].map((position) => ({
      start: { position, side: "after" }, end: { position, side: "after" },
    })),
  });
  const seam = { position: source.duration, side: "before" as const };
  assert.deepEqual(preimageTemporalMap(map, { start: seam, end: seam }).regions, [
    { start: { position: value("2"), side: "before" }, end: { position: value("2"), side: "before" } },
    { start: { position: value("4"), side: "before" }, end: { position: value("4"), side: "before" } },
  ]);
  const reverse = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: target.duration },
    sourceAtStart: source.duration, rate: { numerator: -1, denominator: 1 },
    wrap: { start: value("0"), end: source.duration },
  }] }] });
  const reverseAnchor = { position: value("1"), side: "before" as const };
  assert.deepEqual(preimageTemporalMap(reverse, { start: reverseAnchor, end: reverseAnchor }).regions,
    [value("1"), value("3")].map((position) => ({
      start: { position, side: "after" }, end: { position, side: "after" },
    })));
});

test("Temporal Map preimage maps an exact source region back through rational rate", () => {
  const value = (ticks: string, denominator = 1) => ({ ticks, timeBase: { numerator: 1, denominator } });
  const target = { id: "rate-target", duration: value("2") };
  const source = { id: "rate-source", duration: value("4") };
  const map = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: target.duration },
    sourceAtStart: value("0"), rate: { numerator: 2, denominator: 1 },
  }] }] });
  assert.deepEqual(preimageTemporalMap(map, {
    start: { position: value("1"), side: "after" },
    end: { position: value("3"), side: "before" },
  }).regions, [{
    start: { position: value("1", 2), side: "after" },
    end: { position: value("3", 2), side: "before" },
  }]);
});

test("domain-bearing temporal events reject an unrelated Map source domain", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const target = { id: "event-target", duration: value("4") };
  const source = { id: "event-source", duration: value("4") };
  const map = identityTemporalMap(source);
  const point = { position: value("2"), side: "after" as const };
  const event = temporalMapPointRegionSet(source, point);
  assert.deepEqual(uniqueTemporalMapRegionSetPoint(preimageTemporalMapRegions(map, event)), point);
  assert.throws(() => preimageTemporalMapRegions(map, {
    ...event, domain: { ...target, id: "different-source" },
  }), /not source domain/u);
});

test("Temporal Map preimage carries a hold region exactly through a reverse stage", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const parent = { id: "preimage-parent", duration: value("8") };
  const occurrence = { id: "preimage-occurrence", duration: value("8") };
  const source = { id: "preimage-source", duration: value("10") };
  const reverse = sealTemporalMap({ stages: [{ target: parent, source: occurrence, pieces: [{
    target: { start: value("0"), end: parent.duration },
    sourceAtStart: occurrence.duration, rate: { numerator: -1, denominator: 1 },
  }] }] });
  const selection = sealTemporalMap({ stages: [{ target: occurrence, source, pieces: [
    { target: { start: value("0"), end: value("2") },
      sourceAtStart: value("1"), rate: { numerator: 1, denominator: 1 } },
    { target: { start: value("2"), end: value("4") },
      sourceAtStart: value("5"), rate: { numerator: 0, denominator: 1 } },
    { target: { start: value("4"), end: value("8") },
      sourceAtStart: value("0"), rate: { numerator: 1, denominator: 1 },
      wrap: { start: value("0"), end: value("2") } },
  ] }] });
  const held = { position: value("5"), side: "after" as const };
  assert.deepEqual(preimageTemporalMap(composeTemporalMaps(reverse, selection), {
    start: held, end: held,
  }), {
    domain: parent,
    regions: [{
      start: { position: value("4"), side: "after" },
      end: { position: value("6"), side: "before" },
    }],
  });
  const missing = { position: value("9"), side: "after" as const };
  assert.deepEqual(preimageTemporalMap(composeTemporalMaps(reverse, selection), {
    start: missing, end: missing,
  }).regions, []);
});

test("Temporal Map preimage refuses to disguise an inexact cubic root as exact time", () => {
  const value = (ticks: string) => ({ ticks, timeBase: { numerator: 1, denominator: 1 } } as const);
  const target = { id: "cubic-target", duration: value("2") };
  const source = { id: "cubic-source", duration: value("2") };
  const map = sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: value("0"), end: target.duration },
    sourceAtStart: value("0"), sourceControl1: value("0"),
    sourceControl2: value("2"), sourceAtEnd: value("2"),
  }] }] });
  const anchor = { position: value("1"), side: "after" as const };
  assert.throws(() => preimageTemporalMap(map, { start: anchor, end: anchor }),
    /does not approximate cubic roots/u);
});
