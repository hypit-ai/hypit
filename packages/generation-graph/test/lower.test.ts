import assert from "node:assert/strict";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";
import { createResolvedClosure, link, planBuild } from "@hypit/kernel";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";

import {
  lowerGenerationGraph,
  type GenerationGraphProject,
} from "../src/index.js";

const moduleRef = { name: "@example/generator", version: "1" } as const;
const artifactType = { module: moduleRef, name: "Artifact" } satisfies TypeRef;
const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [artifactType.name],
  capabilities: [],
  producers: [{
    name: "transform",
    inputs: [{ name: "source", type: artifactType }],
    result: { kind: "output", name: "artifact", type: artifactType },
  }],
};
const fragment = sealGraphFragment({
  inputs: [{ name: "source", type: artifactType }],
  operations: [{
    id: "transform",
    producer: { module: moduleRef, name: "transform" },
    inputs: { source: { kind: "fragment-input", name: "source" } },
    result: { kind: "output", name: "artifact" },
  }],
  exports: [{
    name: "result",
    type: artifactType,
    root: { kind: "fragment-operation", operation: "transform" },
  }],
});
const selectedPath = "./products/final/take-002.json";

function project(finalSelection: "generate" | string): GenerationGraphProject {
  return {
    format: "hypit.generation-graph@1",
    id: "images",
    name: "Images",
    revision: 0,
    nodes: [{
      id: "base",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { value: "prompt" } },
      products: [],
      selected: "generate",
    }, {
      id: "final",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { node: "base" } },
      products: [selectedPath],
      selected: finalSelection,
    }, {
      id: "delivery",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { node: "final" } },
      products: [],
      selected: "generate",
    }],
    layout: [],
  };
}

const host = {
  resolveImplementation: () => ({
    using: { module: moduleRef, name: "transform" },
    fragment,
  }),
  resolveProduct: () => ({ id: "product:final:take-002", type: artifactType, value: "finished" }),
};

test("selecting generate preserves the demanded Operation chain", () => {
  const lowered = lowerGenerationGraph(
    project("generate"),
    link(createResolvedClosure([manifest]), []),
    host,
  );
  const planned = planBuild(lowered.program, lowered.graph, ["final"]);
  assert.equal(planned.plan.steps.length, 2);
  assert.deepEqual(lowered.graph.outputs.map((output) => output.id), ["base", "delivery", "final"]);
});

test("selecting a Product is a Record root and naturally truncates execution", () => {
  const lowered = lowerGenerationGraph(
    project(selectedPath),
    link(createResolvedClosure([manifest]), []),
    host,
  );
  const final = lowered.graph.outputs.find((output) => output.id === "final");
  assert.deepEqual(final?.result, { kind: "record", id: "product:final:take-002" });

  const reused = planBuild(lowered.program, lowered.graph, ["final"]);
  assert.deepEqual(reused.plan.steps, []);
  assert.deepEqual(reused.plan.goals, ["product:final:take-002"]);

  const regeneratedBase = planBuild(lowered.program, lowered.graph, ["base"]);
  assert.equal(regeneratedBase.plan.steps.length, 1);

  const downstream = planBuild(lowered.program, lowered.graph, ["delivery"]);
  assert.equal(downstream.plan.steps.length, 1);
  assert.equal(downstream.plan.steps[0]?.inputs.source, "product:final:take-002");
});
