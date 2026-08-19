import assert from "node:assert/strict";
import test from "node:test";

import type { BuildState, CompiledGraph } from "@hypit/protocol";

import { unreachedGenerations } from "../src/reachability.js";

const producer = { module: { name: "@hypit/nano-banana", version: "1" }, name: "request-nano-banana-2" };

const graph = {
  format: "hypit.graph@1",
  outputs: [],
  candidates: [],
  operations: [
    {
      id: "operation:used", producer, inputs: {},
      result: { kind: "need", name: "used.image", id: "need:used", record: "record:used" },
    },
    {
      id: "operation:orphan", producer, inputs: {},
      result: { kind: "need", name: "orphan.image", id: "need:orphan", record: "record:orphan" },
    },
    {
      id: "operation:reused", producer, inputs: {},
      result: { kind: "need", name: "reused.image", id: "need:reused", record: "record:reused" },
    },
    {
      id: "operation:computed", producer, inputs: {},
      result: { kind: "output", name: "board.program", record: "record:computed" },
    },
  ],
} as unknown as CompiledGraph;

const state = {
  plan: {
    format: "hypit.plan@1",
    steps: [{ id: "step:used", producer, inputs: {}, outputs: { image: "record:used" }, needs: {} }],
    goals: [],
    selections: [{ output: "output:reused", candidate: "candidate:reused", record: "record:reused" }],
  },
} as unknown as BuildState;

test("a generation this Run will not perform is named, and reuse is not mistaken for one", () => {
  const found = unreachedGenerations(graph, state, { "operation:orphan": "paper.image" });
  assert.deepEqual(found.map((item) => item.name), ["paper.image"],
    "the planned generation is performed, and the satisfied one is deliberately reused");
  assert.equal(found[0]!.producer, "@hypit/nano-banana@1/request-nano-banana-2");
});

test("a computed value nothing builds is not reported, because leaving one costs nothing", () => {
  const onlyComputed = {
    ...graph,
    operations: (graph as unknown as { operations: readonly unknown[] }).operations.slice(3),
  } as unknown as CompiledGraph;
  assert.deepEqual(unreachedGenerations(onlyComputed, state), [],
    "components publish Programs beside the Tracks that carry them; only an external request wastes anything");
});
