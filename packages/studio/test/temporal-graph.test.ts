import assert from "node:assert/strict";
import test from "node:test";

import type { BuildState, ProducerStep, TypeRef, TypedRecord } from "@hypit/protocol";

import { executedTemporalBindings } from "../src/temporal-graph.js";

const module = (name: string) => ({ name, version: "1" });
const type = (owner: string, name: string): TypeRef => ({ module: module(owner), name });
const record = (id: string, owner: string, name: string, value: unknown): TypedRecord => ({
  id, type: type(owner, name), value: { kind: "inline", value: value as never },
});
const producer = (owner: string, name: string) => ({ module: module(owner), name });
const step = (id: string, owner: string, name: string, inputs: ProducerStep["inputs"], outputs: ProducerStep["outputs"]): ProducerStep => ({
  id, producer: producer(owner, name), inputs, outputs, needs: {},
});

test("Studio reads Instant lineage and author authority from executed graph edges", () => {
  const program = [
    record("semantic", "@hypit/semantic-track", "SemanticTrack", { id: "speech" }),
    record("moment", "@hypit/narrative", "NarrativeMoment", { id: "cue", anchorId: "cue-anchor" }),
    record("point-spec", "@hypit/temporal", "TemporalInstantSpec", {
      id: "deck.card", subjectId: "card", projection: { ref: "moment.cue" }, authority: { kind: "semantic", boundary: "cue" },
    }),
    record("card-spec", "@hypit/deck-track", "DepthStackCardSpec", { id: "card" }),
  ];
  const executed = [
    record("point", "@hypit/temporal", "TemporalInstant", {
      id: "deck.card::cue", subjectId: "card", source: { spaceId: "speech", narrativeId: "story", kind: "moment", id: "cue" }, projection: { ref: "moment.cue" },
      authority: { kind: "semantic", boundary: "cue" }, frame: 42,
    }),
    record("cards", "@hypit/deck-track", "DepthStackCardSet", { cards: [{ id: "card", activationFrame: 42 }] }),
    record("track", "@hypit/composition", "VisualTrack", { presents: [] }),
    record("unused-point", "@hypit/temporal", "TemporalInstant", {
      id: "unused::cue", subjectId: "unused", source: { spaceId: "speech", narrativeId: "story", kind: "moment", id: "cue" }, projection: { ref: "moment.cue" },
      authority: { kind: "semantic", boundary: "cue" }, frame: 7,
    }),
  ];
  const steps = [
    step("project", "@hypit/temporal", "project-moment-instant", { semantic: "semantic", moment: "moment", spec: "point-spec" }, { instant: "point" }),
    step("append", "@hypit/deck-track", "append-depth-stack-card", { set: "empty", spec: "card-spec", activation: "point" }, { set: "cards" }),
    step("render", "@hypit/deck-track", "render-depth-stack", { program: "cards" }, { track: "track" }),
  ];
  const state = {
    format: "hypit.build@1",
    program: { closure: { modules: [] }, records: program },
    targets: [{ output: "visual" }],
    plan: {
      format: "hypit.plan@1", steps, goals: [{ record: "track", type: type("@hypit/composition", "VisualTrack") }],
      outputBindings: [{ output: "visual", record: "track", type: type("@hypit/composition", "VisualTrack") }],
    },
    status: "complete", records: executed, steps: steps.map(({ id }) => ({ id, status: "complete" as const })),
    needs: [], outstanding: [], diagnostics: [],
  } as unknown as BuildState;

  const bindings = executedTemporalBindings(state, "visual");
  assert.equal(bindings.length, 1);
  assert.deepEqual(bindings[0], {
    record: "point",
    subjectId: "card",
    id: "deck.card::cue",
    projection: {
      kind: "instant", expression: "moment.cue", reference: "moment.cue", frame: 42,
      source: { spaceId: "speech", narrativeId: "story", kind: "moment", id: "cue" },
      authority: { kind: "semantic", source: { spaceId: "speech", narrativeId: "story", kind: "moment", id: "cue" }, boundary: "cue" },
    },
    consumers: [{
      step: "append",
      producer: producer("@hypit/deck-track", "append-depth-stack-card"),
      input: "activation",
      role: "domain",
      inputs: [
        { name: "activation", record: "point", type: type("@hypit/temporal", "TemporalInstant"), value: executed[0]!.value.kind === "inline" ? executed[0]!.value.value : undefined },
        { name: "spec", record: "card-spec", type: type("@hypit/deck-track", "DepthStackCardSpec"), value: { id: "card" } },
      ],
    }],
  });
});
