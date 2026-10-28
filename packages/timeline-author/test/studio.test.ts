import assert from "node:assert/strict";
import test from "node:test";

import type { StudioPlacement } from "@hypit/studio-companion";

import { timelineAuthorModuleRef } from "../src/manifest.js";
import { timelineAuthorStudioTemporalDeclarations } from "../src/studio.js";

const placement = (declaration: string, outputPorts: StudioPlacement["outputPorts"],
  children: StudioPlacement["children"] = []): StudioPlacement => ({
  tag: `time:${declaration}`,
  module: timelineAuthorModuleRef,
  sourcePath: "main.svml",
  declaration,
  id: declaration === "timeline" ? "program" : "cue",
  range: { start: 0, end: 100 },
  records: [], values: [], outputs: outputPorts.map((item) => item.ref), outputPorts,
  children, attributes: {}, attributeValueRanges: {}, referenceAttributes: {}, referenceTypes: {}, references: [],
});

test("Timeline author companions expose primary Instants without Window boundaries", () => {
  const timeline = placement("timeline", [
    { name: "timeline", ref: "program.timeline" },
    { name: "window", ref: "program.window" },
    { name: "start", ref: "program.start" },
    { name: "end", ref: "program.end" },
    { name: "anchor-speech", ref: "program.speech" },
    { name: "anchor-speech-start", ref: "program.speech.start" },
    { name: "anchor-speech-end", ref: "program.speech.end" },
    { name: "anchor-cue", ref: "program.cue" },
  ], [{ tag: "time:Window", sourcePath: "main.svml", id: "speech", range: { start: 10, end: 30 },
    attributes: {}, attributeValueRanges: {}, references: [], referenceAttributes: {}, referenceTypes: {}, values: [] },
  { tag: "time:Instant", sourcePath: "main.svml", id: "cue", range: { start: 31, end: 45 },
    attributes: {}, attributeValueRanges: {}, references: [], referenceAttributes: {}, referenceTypes: {}, values: [] }]);
  const companion = timelineAuthorStudioTemporalDeclarations.find((item) => item.match.declaration === "timeline")!;
  assert.deepEqual(companion.project({ placement: timeline }), [{ id: "cue", label: "cue",
    output: "program.cue", range: { start: 31, end: 45 } }]);
  assert.equal(timelineAuthorStudioTemporalDeclarations.some(item => item.match.declaration === "window"), false);
});
