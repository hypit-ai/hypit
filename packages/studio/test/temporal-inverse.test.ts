import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize } from "@hypit/protocol";
import type { ProducerStep, TypeRef, TypedRecord } from "@hypit/protocol";

import { planTemporalInverse, temporalAuthorBindings } from "../src/temporal-inverse.js";
import { StudioCompanionRegistry } from "../src/studio-registry.js";
import { commonTemporalStudioRelations } from "@hypit/temporal/studio";
import { timelineAuthorProducers } from "../../timeline-author/src/manifest.js";
import { timelineAuthorStudioTemporalRelations } from "../../timeline-author/src/studio.js";
import { executedGraph } from "./executed-graph-scenario.js";
import type { ExecutedGraph } from "../src/temporal-graph.js";
import type { Placement } from "../src/observe.js";

const module = (name: string) => ({ name, version: "1" });
const type = (owner: string, name: string): TypeRef => ({ module: module(owner), name });
const record = (id: string, owner: string, name: string, value: unknown): TypedRecord => ({
  id, type: type(owner, name), value: canonicalize(value),
});
const step = (id: string, name: string, inputs: ProducerStep["inputs"], outputs: Readonly<Record<string, string>>): ProducerStep => {
  const [result] = Object.entries(outputs);
  assert.ok(result);
  return { id, producer: { module: module("@hypit/temporal"), name }, inputs,
    result: { kind: "output", name: result[0], record: result[1] } };
};

function fixture(): ExecutedGraph {
  const program = [
    record("timeline", "@hypit/timeline", "Timeline", {
      id: "main", frameRate: { numerator: 30, denominator: 1 }, frameCount: 100,
    }),
    record("start-spec", "@hypit/temporal", "TemporalInstantSpec", {
      id: "clip.start", subjectId: "clip", projection: { ref: "absolute", at: { unit: "frames", value: 10 } },
      author: { binding: "from", relation: "direct" },
    }),
    record("duration", "@hypit/temporal", "TemporalDuration", { unit: "frames", value: 20 }),
    record("shift-spec", "@hypit/temporal", "TemporalShiftSpec", {
      id: "clip.end", subjectId: "clip", direction: 1,
      author: { binding: "for", relation: "after-start" },
    }),
    record("window-spec", "@hypit/temporal", "TemporalWindowSpec", { id: "clip", subjectId: "clip" }),
  ];
  const executed = [
    record("upstream-start", "@hypit/temporal", "TemporalInstant", {
      id: "clip.start", subjectId: "clip", timelineId: "main", frame: 10,
    }),
    record("start", "@hypit/temporal", "TemporalInstant", {
      id: "clip.start", subjectId: "clip", timelineId: "main", frame: 10,
    }),
    record("extent", "@hypit/temporal", "TemporalExtent", {
      duration: { ticks: "2", timeBase: { numerator: 1, denominator: 3 } },
    }),
    record("end", "@hypit/temporal", "TemporalInstant", {
      id: "clip.end", subjectId: "clip", timelineId: "main", frame: 30,
    }),
    record("window", "@hypit/temporal", "TemporalWindow", {
      id: "clip", subjectId: "clip",
      start: { id: "clip.start", subjectId: "clip", timelineId: "main", frame: 10 },
      end: { id: "clip.end", subjectId: "clip", timelineId: "main", frame: 30 },
      span: { startFrame: 10, endFrameExclusive: 30 },
    }),
  ];
  const steps = [
    step("project", "project-program-instant", { timeline: "timeline", spec: "start-spec" }, { instant: "upstream-start" }),
    step("reuse", "reuse-instant", { instant: "upstream-start" }, { instant: "start" }),
    step("extent", "extent-from-duration", { timeline: "timeline", duration: "duration" }, { extent: "extent" }),
    step("shift", "shift-instant", { timeline: "timeline", instant: "start", extent: "extent", spec: "shift-spec" }, { instant: "end" }),
    step("compose", "compose-window", { spec: "window-spec", start: "start", end: "end" }, { window: "window" }),
  ];
  return executedGraph({ programRecords: program, steps, records: executed });
}

const source = '<Clip from="10f" for="20f"/>';
const fromStart = source.indexOf("10f");
const forStart = source.indexOf("20f");
const placement: Placement = {
  sourcePath: "/project/main.svml",
  tag: "Clip",
  module: module("@example/clip"),
  declaration: "clip",
  range: { start: 0, end: source.length },
  authorEndpoints: { from: "author:from", for: "author:for" },
  records: ["start-spec", "duration", "shift-spec", "window-spec"],
  values: [],
  outputs: [],
  outputPorts: [],
  attributes: { from: "10f", for: "20f" },
  referenceAttributes: {},
  attributeValueRanges: {
    from: { start: fromStart, end: fromStart + 3 },
    for: { start: forStart, end: forStart + 3 },
  },
  references: [],
  referenceTypes: {},
  children: [],
};

function bindings(state: ExecutedGraph) {
  return temporalAuthorBindings({
    state,
    rootRecord: "window",
    workspaceRoot: "/project",
    placements: [placement],
    files: [{ path: "/project/main.svml", text: source, language: "svml" }],
  });
}

const plan = (state: ExecutedGraph, startFrame: number, endFrameExclusive: number) => planTemporalInverse({
  state,
  rootRecord: "window",
  target: { kind: "window", startFrame, endFrameExclusive },
  bindings: bindings(state),
  domainFrame: () => undefined,
  registry: new StudioCompanionRegistry([], { temporalRelations: commonTemporalStudioRelations }),
});

test("recursive Temporal inverse crosses reuse and atomically compensates from/for", () => {
  const state = fixture();
  assert.deepEqual(bindings(state).map((binding) => [binding.binding, binding.source.endpoint]), [
    ["start-spec:from", "author:from"],
    ["shift-spec:for", "author:for"],
  ]);
  assert.deepEqual(plan(state, 15, 30).map((write) => [write.source.endpoint, write.replacement]), [
    ["author:from", "15f"],
    ["author:for", "15f"],
  ]);
});

test("move preserves duration while trim-end changes only the owned extent", () => {
  const state = fixture();
  assert.deepEqual(plan(state, 15, 35).map((write) => [write.source.endpoint, write.replacement]), [
    ["author:from", "15f"],
  ]);
  assert.deepEqual(plan(state, 10, 40).map((write) => [write.source.endpoint, write.replacement]), [
    ["author:for", "30f"],
  ]);
});

test("Timeline Author Companion reverses private Points and Extents through the shared FrameSpan", () => {
  const timelineModule = module("@hypit/timeline-author");
  const authorType = (name: string) => ({ module: timelineModule, name });
  const program = [
    record("clock", "@hypit/timeline", "Clock", { frameRate: { numerator: 30, denominator: 1 } }),
    record("from-duration", "@hypit/timeline-author", "ConstructionDurationSpec", {
      duration: { unit: "frames", value: 10 },
    }),
    record("from-spec", "@hypit/timeline-author", "ConstructionOffsetSpec", {
      direction: 1, author: { binding: "from", declarationId: "clip", expression: { kind: "absolute" } },
    }),
    record("for-spec", "@hypit/timeline-author", "ConstructionDurationSpec", {
      duration: { unit: "frames", value: 20 }, author: { binding: "for", declarationId: "clip" },
    }),
    record("timeline", "@hypit/timeline", "Timeline", {
      id: "main", frameRate: { numerator: 30, denominator: 1 }, frameCount: 100,
    }),
    record("identity", "@hypit/timeline-author", "ConstructionIdentitySpec", { id: "main.clip" }),
  ];
  const executed = [
    { id: "origin", type: authorType("ConstructionPoint"), value: ({ frame: 0 }) },
    { id: "from-extent", type: authorType("ConstructionExtent"), value: ({ frameCount: 10 }) },
    { id: "start-point", type: authorType("ConstructionPoint"), value: ({ frame: 10 }) },
    { id: "clip-extent", type: authorType("ConstructionExtent"), value: ({ frameCount: 20 }) },
    { id: "clip-span", type: type("@hypit/timeline", "FrameSpan"), value: ({ startFrame: 10, endFrameExclusive: 30 }) },
    record("author-window", "@hypit/temporal", "TemporalWindow", {
      id: "main.clip", subjectId: "main.clip",
      start: { id: "main.clip.start", subjectId: "main.clip", timelineId: "main", frame: 10 },
      end: { id: "main.clip.end", subjectId: "main.clip", timelineId: "main", frame: 30 },
      span: { startFrame: 10, endFrameExclusive: 30 },
    }),
  ] as TypedRecord[];
  const authorStep = (id: string, producer: keyof typeof timelineAuthorProducers,
    inputs: ProducerStep["inputs"], outputName: string, output: string): ProducerStep => ({
      id,
      producer: timelineAuthorProducers[producer],
      inputs,
      result: { kind: "output", name: outputName, record: output },
    });
  const steps = [
    authorStep("origin", "origin", { clock: "clock" }, "point", "origin"),
    authorStep("from-duration", "duration", { clock: "clock", duration: "from-duration" }, "extent", "from-extent"),
    authorStep("offset", "offset", { point: "origin", extent: "from-extent", spec: "from-spec" }, "point", "start-point"),
    authorStep("for-duration", "duration", { clock: "clock", duration: "for-spec" }, "extent", "clip-extent"),
    authorStep("span", "span", { start: "start-point", extent: "clip-extent" }, "span", "clip-span"),
    authorStep("window", "window", { timeline: "timeline", span: "clip-span", spec: "identity" }, "window", "author-window"),
  ];
  const state = executedGraph({ programRecords: program, steps, records: executed });
  const text = '<time:Window id="clip" from="10f" for="20f"/>';
  const child: Placement = {
    sourcePath: "/project/main.svml", authorEndpoints: { from: "child:from", for: "child:for" },
    tag: "time:Window", module: timelineModule, declaration: "window", range: { start: 0, end: text.length },
    records: ["from-spec", "for-spec"], attributes: { from: "10f", for: "20f" }, referenceAttributes: {},
    values: [], outputs: [], outputPorts: [], references: [], referenceTypes: {},
    attributeValueRanges: {
      from: { start: text.indexOf("10f"), end: text.indexOf("10f") + 3 },
      for: { start: text.indexOf("20f"), end: text.indexOf("20f") + 3 },
    }, children: [],
  };
  const owned = temporalAuthorBindings({ state, rootRecord: "author-window", workspaceRoot: "/project",
    placements: [child], files: [{ path: "/project/main.svml", text, language: "svml" }] });
  const registry = new StudioCompanionRegistry([], { temporalRelations: timelineAuthorStudioTemporalRelations });
  const writes = planTemporalInverse({ state, rootRecord: "author-window",
    target: { kind: "window", startFrame: 15, endFrameExclusive: 30 }, bindings: owned,
    domainFrame: () => undefined, registry });
  assert.deepEqual(writes.map((write) => [write.source.endpoint, write.replacement]), [
    ["child:from", "15f"], ["child:for", "15f"],
  ]);
});

test("relation alternatives are solved by their final author writes", () => {
  const spec = record("spec", "@example/time", "Spec", { author: { binding: "at" } });
  const point = record("point", "@hypit/temporal", "TemporalInstant", {
    id: "point", subjectId: "point", timelineId: "main", frame: 10,
  });
  const producer = { module: module("@example/time"), name: "choose-point" };
  const operation: ProducerStep = {
    id: "choose",
    producer,
    inputs: { spec: "spec" },
    result: { kind: "output", name: "point", record: "point" },
  };
  const state = executedGraph({ programRecords: [spec], steps: [operation], records: [point] });
  const binding = {
    id: "spec:at", binding: "spec:at", name: "at", value: "10f", language: "svml" as const, writable: true,
    source: { endpoint: "author:at", path: "main.svml", range: { start: 0, end: 3 }, preimage: "10f" },
  };
  const alternatives = (replacements: readonly string[]) => new StudioCompanionRegistry([], { temporalRelations: [{
    id: "choose-point", match: { producer, output: "point" },
    invert: () => replacements.map((replacement) => ({ writes: [{ input: "spec", binding: "at", replacement }] })),
  }] });
  const planWith = (registry: StudioCompanionRegistry) => planTemporalInverse({
    state, rootRecord: "point", target: { kind: "instant", frame: 12 }, bindings: [binding],
    domainFrame: () => undefined, registry,
  });
  assert.deepEqual(planWith(alternatives(["12f", "12f"])).map((write) => write.replacement), ["12f"]);
  assert.throws(() => planWith(alternatives(["12f", "13f"])), /multiple distinct author inverses/u);
});
