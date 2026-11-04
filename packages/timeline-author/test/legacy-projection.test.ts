import assert from "node:assert/strict";
import test from "node:test";

import type { Timeline } from "@hypit/timeline";

import { projectTimelineInstant } from "../src/legacy-projection.js";
import type { TimelineInstantExpression } from "../src/types.js";

const timeline: Timeline = { id: "film", frameRate: { numerator: 30, denominator: 1 }, frameCount: 300 };
const frames = (value: number) => ({ unit: "frames" as const, value });
const seconds = (numerator: number, denominator = 1) => ({ unit: "seconds" as const, numerator, denominator });
const instant = (id: string, projection: TimelineInstantExpression) =>
  projectTimelineInstant({ itemId: id, subjectId: "subject", timeline, projection });

test("Timeline Author resolves boundary expressions into minimal Instants", () => {
  assert.deepEqual(instant("start", { ref: "timeline.start" }), {
    id: "start", subjectId: "subject", timelineId: "film", frame: 0,
  });
  assert.deepEqual(instant("end", { ref: "timeline.end" }), {
    id: "end", subjectId: "subject", timelineId: "film", frame: 300,
  });
  assert.equal(instant("absolute", { ref: "absolute", at: seconds(5, 2), offset: frames(8) }).frame, 83);
});

test("Timeline Author projection uses exact rational clock arithmetic and rejects out-of-range points", () => {
  const ntsc: Timeline = { id: "ntsc", frameRate: { numerator: 30_000, denominator: 1_001 }, frameCount: 30 };
  assert.equal(projectTimelineInstant({ itemId: "half", subjectId: "half", timeline: ntsc,
    projection: { ref: "absolute", at: { unit: "milliseconds", value: 500 } } }).frame, 15);
  assert.throws(() => instant("before", { ref: "timeline.start", offset: frames(-1) }), /falls outside Timeline/u);
  assert.throws(() => instant("after", { ref: "timeline.end", offset: frames(1) }), /falls outside Timeline/u);
});
