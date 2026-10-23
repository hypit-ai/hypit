import assert from "node:assert/strict";
import test from "node:test";

import { parseStructuredElement } from "@hypit/markup";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";
import {
  decodeAbsoluteInstantSurface,
  decodeAbsoluteWindowSurface,
  decodeTimelineAuthorSurface,
  timelineAuthorTypes,
} from "@hypit/timeline-author";

const absoluteReferences = new Map([
  ["film.timeline", { path: "film.timeline", type: timelineTypes.timeline, ref: { kind: "record" as const, id: "film.timeline" } }],
  ["reveal", { path: "reveal", type: temporalTypes.instant, ref: { kind: "record" as const, id: "reveal" } }],
  ["answer-end", { path: "answer-end", type: temporalTypes.instant, ref: { kind: "record" as const, id: "answer-end" } }],
]);

function clockReference(numerator: number, denominator = 1) {
  return {
    path: "clock",
    type: timelineTypes.clock,
    ref: { kind: "record" as const, id: "clock" },
    record: {
      id: "clock",
      type: timelineTypes.clock,
      value: ({ frameRate: { numerator, denominator } }),
    },
  };
}

test("Timeline Surface publishes its range and every named Instant or Window", async () => {
  const source = `<time:Timeline id="film" clock={clock} end="latest(speech.end,outro.end)">
    <time:Window id="outro" from="private-cue" for="3s"/>
    <time:Window id="speech" from="start" for={voice.extent}/>
    <time:Instant id="private-cue" at="speech.end"/>
  </time:Timeline>`;
  const element = parseStructuredElement({ name: "timeline.svml", text: source }, 0).element;
  const references = new Map([
    ["clock", { path: "clock", type: timelineTypes.clock, ref: { kind: "record" as const, id: "clock" } }],
    ["voice.extent", { path: "voice.extent", type: temporalTypes.extent, ref: { kind: "record" as const, id: "voice.extent" } }],
  ]);
  const output = await decodeTimelineAuthorSurface({
    sourceName: "timeline.svml", element,
    resolveReference: (path) => references.get(path),
    resolveAsset: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(output.exports, [
    "film.timeline", "film.window", "film.start", "film.end",
    "film.outro", "film.outro.start", "film.outro.end",
    "film.speech", "film.speech.start", "film.speech.end", "film.private-cue",
  ]);
  const childRecords = output.records.filter((record) => record.range.start !== element.range.start);
  assert.equal(childRecords.length, 1);
  assert.equal(childRecords[0]?.type.name, timelineAuthorTypes.duration.name);
  assert.deepEqual(childRecords[0]?.value, {
    duration: { unit: "seconds", numerator: 3, denominator: 1 },
    author: { binding: "for", declarationId: "outro" },
  });
  assert.equal(childRecords[0]?.range.start, source.indexOf('<time:Window id="outro"'));
});

test("Timeline Window requires exactly two of from, until and for", () => {
  const source = '<time:Timeline id="film" clock={clock} end="3s"><time:Window id="bad" from="start"/></time:Timeline>';
  const element = parseStructuredElement({ name: "timeline.svml", text: source }, 0).element;
  assert.throws(() => decodeTimelineAuthorSurface({
    sourceName: "timeline.svml", element,
    resolveReference: () => ({ path: "clock", type: timelineTypes.clock, ref: { kind: "record", id: "clock" } }),
    resolveAsset: async () => { throw new Error("unused"); },
  }), /exactly two/);
});

test("Timeline Surface rejects every static duration literal between frame boundaries", () => {
  for (const source of [
    '<time:Timeline id="film" clock={clock} end="4.25s"/>',
    '<time:Timeline id="film" clock={clock} end="3s"><time:Window id="tail" from="start" for="250ms"/></time:Timeline>',
    '<time:Timeline id="film" clock={clock} end="3s"><time:Instant id="cue" at="start+250ms"/></time:Timeline>',
  ]) {
    const element = parseStructuredElement({ name: "timeline.svml", text: source }, 0).element;
    assert.throws(() => decodeTimelineAuthorSurface({
      sourceName: "timeline.svml", element,
      resolveReference: () => clockReference(30),
      resolveAsset: async () => { throw new Error("unused"); },
    }), /Timeline film at 30\/1 fps: Timeline construction duration must resolve to a non-negative exact frame extent/);
  }
});

test("Timeline Surface accepts exact static frame boundaries at rational rates", async () => {
  const source = `<time:Timeline id="film" clock={clock} end="1001ms">
    <time:Window id="tail" until="end" for="1001ms"/>
  </time:Timeline>`;
  const element = parseStructuredElement({ name: "timeline.svml", text: source }, 0).element;
  const output = await decodeTimelineAuthorSurface({
    sourceName: "timeline.svml", element,
    resolveReference: () => clockReference(30_000, 1_001),
    resolveAsset: async () => { throw new Error("unused"); },
  });
  assert.equal(output.exports?.includes("film.timeline"), true);
  assert.equal(output.exports?.includes("film.tail"), true);
});

test("Timeline Surface defers frame-boundary validation for runtime Clock values", async () => {
  const source = '<time:Timeline id="film" clock={clock} end="4.25s"/>';
  const element = parseStructuredElement({ name: "timeline.svml", text: source }, 0).element;
  const output = await decodeTimelineAuthorSurface({
    sourceName: "timeline.svml", element,
    resolveReference: () => ({
      path: "clock", type: timelineTypes.clock, ref: { kind: "component-output", component: "runtime-clock", output: "clock" },
    }),
    resolveAsset: async () => { throw new Error("unused"); },
  });
  assert.equal(output.exports?.includes("film.timeline"), true);
});

test("standalone Window publishes one reusable value and its boundaries", async () => {
  const element = parseStructuredElement({ name: "timeline.svml", text:
    '<time:Window id="reveal-band" timeline={film.timeline} from={reveal} until={answer-end}/>' }, 0).element;
  const output = await decodeAbsoluteWindowSurface({
    sourceName: "timeline.svml", element,
    resolveReference: (path) => absoluteReferences.get(path),
    resolveAsset: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(output.exports, ["reveal-band", "reveal-band.start", "reveal-band.end"]);
  assert.deepEqual(output.components[0]?.outputs,
    { window: "reveal-band", start: "reveal-band.start", end: "reveal-band.end" });
  assert.equal(output.components[0]?.fragment.exports.find((port) => port.name === "window")?.type.name, "TemporalWindow");
  assert.equal(output.components[0]?.fragment.exports.filter((port) => port.type.name === "TemporalInstant").length, 2);
});

test("standalone Instant publishes direct points and explicit shifts without creating aliases", async () => {
  const literal = parseStructuredElement({ name: "timeline.svml", text:
    '<time:Instant id="credits" timeline={film.timeline} at="timeline.end-2s"/>' }, 0).element;
  const output = await decodeAbsoluteInstantSurface({
    sourceName: "timeline.svml", element: literal,
    resolveReference: (path) => absoluteReferences.get(path),
    resolveAsset: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(output.exports, ["credits"]);
  assert.deepEqual(output.components[0]?.outputs, { instant: "credits" });

  const alias = parseStructuredElement({ name: "timeline.svml", text:
    '<time:Instant id="renamed" timeline={film.timeline} at={reveal}/>' }, 0).element;
  assert.throws(() => decodeAbsoluteInstantSurface({
    sourceName: "timeline.svml", element: alias,
    resolveReference: (path) => absoluteReferences.get(path),
    resolveAsset: async () => { throw new Error("unused"); },
  }), /reference it directly or add an exact offset/);

  const shifted = parseStructuredElement({ name: "timeline.svml", text:
    '<time:Instant id="after-reveal" timeline={film.timeline} at={reveal} offset="+5f"/>' }, 0).element;
  const shiftedOutput = await decodeAbsoluteInstantSurface({
    sourceName: "timeline.svml", element: shifted,
    resolveReference: (path) => absoluteReferences.get(path),
    resolveAsset: async () => { throw new Error("unused"); },
  });
  assert.deepEqual(shiftedOutput.exports, ["after-reveal"]);
  assert.equal(shiftedOutput.components[0]?.fragment.operations.at(-1)?.producer.name, "shift-instant");
});
