import assert from "node:assert/strict";
import test from "node:test";

import { exactTemporalValueFromFrames } from "@hypit/temporal";
import { composeTemporalWindow, resolvedInstant } from "@hypit/timeline";

import { assertNarrativeDomainWindow, projectNarrativeDomainPosition } from "../src/domain-projection.js";

const timeline = { id: "film", frameRate: { numerator: 30, denominator: 1 }, frameCount: 300 };
const instant = (id: string, frame: number) => resolvedInstant({ id, subjectId: "voice" }, timeline, frame);

test("Narrative projects its local exact domain through one resolved Window", () => {
  const domain = { id: "voice-local", duration: exactTemporalValueFromFrames(90, timeline) };
  const window = composeTemporalWindow({ id: "voice", subjectId: "voice" },
    instant("voice.start", 150), instant("voice.end", 240));
  assert.doesNotThrow(() => assertNarrativeDomainWindow(domain, window, timeline));
  assert.equal(projectNarrativeDomainPosition(domain, window, timeline,
    exactTemporalValueFromFrames(0, timeline)), 150);
  assert.equal(projectNarrativeDomainPosition(domain, window, timeline, domain.duration), 240);
});

test("Narrative domain projection rejects mismatched placement and out-of-domain positions", () => {
  const domain = { id: "voice-local", duration: { ticks: "2", timeBase: { numerator: 1, denominator: 1 } } };
  const start = instant("voice.start", 30);
  const window = composeTemporalWindow({ id: "voice", subjectId: "voice" }, start, instant("voice.end", 90));
  const short = composeTemporalWindow({ id: "short", subjectId: "voice" }, start, instant("short.end", 89));
  assert.throws(() => assertNarrativeDomainWindow(domain, short, timeline), /does not cover/u);
  assert.throws(() => projectNarrativeDomainPosition(domain, window, timeline,
    { ticks: "-1", timeBase: { numerator: 1, denominator: 30 } }), /outside narrative domain/u);
  assert.throws(() => projectNarrativeDomainPosition(domain, window, timeline,
    { ticks: "61", timeBase: { numerator: 1, denominator: 30 } }), /outside narrative domain/u);
});
