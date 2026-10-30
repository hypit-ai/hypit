import assert from "node:assert/strict";
import test from "node:test";

import { canonicalize } from "@hypit/protocol";
import type { ProducerStep, TypeRef, TypedRecord } from "@hypit/protocol";

import { executedTemporalBindings } from "../src/temporal-graph.js";
import { commonTemporalStudioRelations } from "@hypit/temporal/studio";
import { narrativeStudioTemporalRelations } from "../../narrative-temporal/src/studio.js";
import { executedGraph } from "./executed-graph-scenario.js";

const module = (name: string) => ({ name, version: "1" });
const type = (owner: string, name: string): TypeRef => ({ module: module(owner), name });
const record = (id: string, owner: string, name: string, value: unknown): TypedRecord => ({
  id, type: type(owner, name), value: canonicalize(value),
});
const producer = (owner: string, name: string) => ({ module: module(owner), name });
const step = (id: string, owner: string, name: string, inputs: ProducerStep["inputs"], outputs: Readonly<Record<string, string>>): ProducerStep => {
  const [result] = Object.entries(outputs);
  assert.ok(result);
  return { id, producer: producer(owner, name), inputs,
    result: { kind: "output", name: result[0], record: result[1] } };
};
const relationFor = (relations: typeof commonTemporalStudioRelations) =>
  (candidate: ProducerStep["producer"], output: string) => relations.find((relation) =>
    relation.match.producer.module.name === candidate.module.name
    && relation.match.producer.module.version === candidate.module.version
    && relation.match.producer.name === candidate.name
    && relation.match.output === output);

test("Studio reads Instant lineage and author authority from executed graph edges", () => {
  const program = [
    record("timeline", "@hypit/timeline", "Timeline", { id: "speech", frameRate: { numerator: 30, denominator: 1 }, frameCount: 100 }),
    record("projection", "@hypit/narrative-temporal", "NarrativeProjection", { id: "story-on-speech", narrativeId: "story", timelineId: "speech", segments: [], tokens: [], boundaries: [] }),
    record("moment", "@hypit/narrative", "NarrativeMoment", { narrativeId: "story", id: "cue", anchorId: "cue-anchor" }),
    record("point-spec", "@hypit/narrative-temporal", "NarrativeInstantSpec", {
      id: "deck.card::cue", subjectId: "card", boundary: "cue",
    }),
    record("card-spec", "@hypit/depth-stack", "DepthStackCardSpec", { id: "card" }),
  ];
  const executed = [
    record("point", "@hypit/temporal", "TemporalInstant", {
      id: "deck.card::cue", subjectId: "card", timelineId: "speech", frame: 42,
    }),
    record("cards", "@hypit/depth-stack", "DepthStackCardSet", { cards: [{ id: "card", activationFrame: 42 }] }),
    record("track", "@hypit/composition", "VisualTrack", { items: [] }),
    record("unused-point", "@hypit/temporal", "TemporalInstant", {
      id: "unused::cue", subjectId: "unused", timelineId: "speech", frame: 7,
    }),
  ];
  const steps = [
    step("project", "@hypit/narrative-temporal", "project-moment-instant", { projection: "projection", moment: "moment", spec: "point-spec" }, { instant: "point" }),
    step("append", "@hypit/depth-stack", "append-depth-stack-card", { set: "empty", spec: "card-spec", activation: "point" }, { set: "cards" }),
    step("render", "@hypit/depth-stack", "render-depth-stack", { program: "cards" }, { track: "track" }),
  ];
  const state = executedGraph({ programRecords: program, steps, records: executed, goals: ["track"] });

  const outputs = [{ output: "visual", record: "track" }];
  const opaque = executedTemporalBindings(state, outputs, "visual");
  assert.deepEqual(opaque[0]?.projection, {
    kind: "instant", expression: "42f", reference: "absolute", frame: 42,
    source: { scope: "timeline", timelineId: "speech", type: type("@hypit/temporal", "TemporalInstant"), kind: "resolved", id: "deck.card::cue" },
    authority: { kind: "fixed" },
  });
  const bindings = executedTemporalBindings(state, outputs, "visual", (sourceType, value) => {
    const held = value as { readonly id?: unknown };
    return sourceType.module.name === "@hypit/narrative" && typeof held.id === "string"
      ? { companion: "narrative", id: "story-on-speech", kind: sourceType.name === "NarrativeMoment" ? "moment" : "source", itemId: held.id }
      : undefined;
  }, relationFor(narrativeStudioTemporalRelations));
  assert.equal(bindings.length, 1);
  assert.deepEqual(bindings[0], {
    record: "point",
    subjectId: "card",
    id: "deck.card::cue",
    projection: {
      kind: "instant", expression: "moment.cue", reference: "moment.cue", frame: 42,
      source: { scope: "timeline", timelineId: "speech", type: type("@hypit/narrative", "NarrativeMoment"), kind: "moment", id: "cue",
        domain: { companion: "narrative", id: "story-on-speech" } },
      authority: { kind: "domain", source: { scope: "timeline", timelineId: "speech", type: type("@hypit/narrative", "NarrativeMoment"), kind: "moment", id: "cue",
        domain: { companion: "narrative", id: "story-on-speech" } }, boundary: "cue" },
    },
    consumers: [{
      step: "append",
      producer: producer("@hypit/depth-stack", "append-depth-stack-card"),
      input: "activation",
      role: "domain",
      inputs: [
        { name: "activation", record: "point", type: type("@hypit/temporal", "TemporalInstant"), value: executed[0]!.value },
        { name: "spec", record: "card-spec", type: type("@hypit/depth-stack", "DepthStackCardSpec"), value: { id: "card" } },
      ],
    }],
  });
});

test("Studio reads author parameter authority declared by the Temporal Spec", () => {
  const program = [
    record("timeline", "@hypit/timeline", "Timeline", {
      id: "main", frameRate: { numerator: 30, denominator: 1 }, frameCount: 100,
    }),
    record("point-spec", "@hypit/temporal", "TemporalInstantSpec", {
      id: "card.activation", subjectId: "card",
      projection: { ref: "absolute", at: { unit: "frames", value: 42 } },
      author: { binding: "at", relation: "direct" },
    }),
    record("card-spec", "@hypit/depth-stack", "DepthStackCardSpec", { id: "card" }),
  ];
  const executed = [
    record("point", "@hypit/temporal", "TemporalInstant", {
      id: "card.activation", subjectId: "card", timelineId: "main", frame: 42,
    }),
    record("cards", "@hypit/depth-stack", "DepthStackCardSet", { cards: [{ id: "card", activationFrame: 42 }] }),
    record("track", "@hypit/composition", "VisualTrack", { items: [] }),
  ];
  const steps = [
    step("project", "@hypit/temporal", "project-program-instant", { timeline: "timeline", spec: "point-spec" }, { instant: "point" }),
    step("append", "@hypit/depth-stack", "append-depth-stack-card", { set: "empty", spec: "card-spec", activation: "point" }, { set: "cards" }),
    step("render", "@hypit/depth-stack", "render-depth-stack", { program: "cards" }, { track: "track" }),
  ];
  const state = executedGraph({ programRecords: program, steps, records: executed, goals: ["track"] });

  const bindings = executedTemporalBindings(
    state,
    [{ output: "visual", record: "track" }],
    "visual",
    undefined,
    relationFor(commonTemporalStudioRelations),
  );
  assert.equal(bindings.length, 1);
  assert.deepEqual(bindings[0]?.projection, {
    kind: "instant",
    expression: "42f",
    reference: "absolute",
    frame: 42,
    source: {
      scope: "timeline",
      timelineId: "main",
      type: type("@hypit/timeline", "Timeline"),
      kind: "timeline",
      id: "main",
    },
    authority: { kind: "parameter", binding: "at", owner: "point-spec:at", relation: "direct" },
  });
});
