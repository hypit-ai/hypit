import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFrameSpan,
  assertTemporalInstantFor,
  assertTemporalWindowFor,
  assertWindowRelation,
  clockFrameSpanSamples,
  composeTemporalWindow,
  resolvedInstant,
  resolveTriggeredSchedule,
} from "../src/index.js";

const timeline = { id: "film", frameRate: { numerator: 30, denominator: 1 }, frameCount: 300 };
const instant = (id: string, frame: number, subjectId = "subject") =>
  resolvedInstant({ id, subjectId }, timeline, frame);

test("FrameSpan owns the common finite half-open frame interval", () => {
  assert.doesNotThrow(() => assertFrameSpan({ startFrame: 0, endFrameExclusive: 1 }, 1));
  assert.throws(() => assertFrameSpan({ startFrame: 1, endFrameExclusive: 1 }), /Frame span/u);
  assert.throws(() => assertFrameSpan({ startFrame: 1, endFrameExclusive: 3 }, 2), /Frame span/u);
});

test("one Clock quantizes adjacent FrameSpans on the same absolute sample grid", () => {
  const clock = { frameRate: { numerator: 30_000, denominator: 1_001 } };
  assert.deepEqual(clockFrameSpanSamples(
    { startFrame: 0, endFrameExclusive: 1 },
    clock,
    48_000,
  ), { startSample: 0, endSampleExclusive: 1_602, sampleFrames: 1_602 });
  assert.deepEqual(clockFrameSpanSamples(
    { startFrame: 1, endFrameExclusive: 2 },
    clock,
    48_000,
  ), { startSample: 1_602, endSampleExclusive: 3_203, sampleFrames: 1_601 });
  assert.deepEqual(clockFrameSpanSamples(
    { startFrame: 0, endFrameExclusive: 2 },
    clock,
    48_000,
  ), { startSample: 0, endSampleExclusive: 3_203, sampleFrames: 3_203 });
});

test("triggered frame schedule belongs to the discrete Timeline layer", () => {
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

test("resolved Window composition belongs to Timeline and preserves endpoint identities", () => {
  const start = instant("reveal", 30, "semantic.reveal");
  const end = instant("answer-end", 90, "semantic.answer-end");
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

test("resolved Instants validate Timeline identity", () => {
  const value = instant("point", 40);
  assert.doesNotThrow(() => assertTemporalInstantFor(value, { timeline }));
  assert.throws(() => assertTemporalInstantFor(value, { timeline: { ...timeline, id: "other" } }), /different Timeline/u);
});

test("Window relation validation preserves input order", () => {
  const window = (id: string, start: number, end: number) => composeTemporalWindow({ id, subjectId: "subject" },
    instant(`${id}.start`, start), instant(`${id}.end`, end));
  const windows = [window("later", 90, 180), window("earlier", 30, 120)];
  assert.equal(assertWindowRelation(windows, "independent"), windows);
  assert.throws(() => assertWindowRelation(windows, "disjoint"), /overlap under disjoint/u);
});
