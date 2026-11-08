import assert from "node:assert/strict";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";
import { createResolvedClosure, link, planBuild } from "@hypit/kernel";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";

import {
  acceptGenerationGraphBuild,
  applyGenerationGraphTransaction,
  lowerGenerationGraph,
  prepareGenerationGraphTargets,
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
    executionPackage: "@example/generator",
  }),
  resolveProduct: () => ({
    record: { id: "product:final:take-002", type: artifactType, value: "finished" },
    attachments: [],
  }),
};

test("selecting generate preserves the demanded Operation chain", async () => {
  const lowered = await lowerGenerationGraph(
    project("generate"),
    link(createResolvedClosure([manifest]), []),
    host,
  );
  const planned = planBuild(lowered.program, lowered.graph, ["final"]);
  assert.equal(planned.plan.steps.length, 2);
  assert.deepEqual(lowered.graph.outputs.map((output) => output.id), ["base", "delivery", "final"]);
});

test("selecting a Product is a Record root and naturally truncates execution", async () => {
  const lowered = await lowerGenerationGraph(
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

test("an exact reused Target bypasses Runtime and creates no new publication", async () => {
  const prepared = await prepareGenerationGraphTargets(
    project(selectedPath),
    link(createResolvedClosure([manifest]), []),
    host,
    ["final"],
  );
  assert.equal(prepared.kind, "reuse");
  assert.deepEqual(prepared.targets.map((target) => ({
    node: target.node,
    record: target.record,
    selected: target.selected,
  })), [{
    node: "final",
    record: "product:final:take-002",
    selected: { product: selectedPath },
  }]);
});

test("a downstream Build publishes only newly executed Node outputs", async () => {
  const original = project(selectedPath);
  const prepared = await prepareGenerationGraphTargets(
    original,
    link(createResolvedClosure([manifest]), []),
    host,
    ["delivery"],
  );
  assert.equal(prepared.kind, "build");
  if (prepared.kind !== "build") throw new Error("expected a Build preparation");
  assert.equal(prepared.definition.plan.steps.length, 1);
  assert.deepEqual(prepared.generated.map((item) => item.node), ["delivery"]);
  assert.deepEqual(prepared.publication.outputs.map((item) => item.name), ["delivery"]);
  assert.deepEqual(prepared.executionPackages, ["@example/generator"]);

  const accepted = acceptGenerationGraphBuild(prepared, "bld_20261108T090000000Z_0000000001");
  assert.deepEqual(accepted.products.map((item) => ({ node: item.node, path: item.path })), [{
    node: "delivery",
    path: "./products/delivery/bld_20261108T090000000Z_0000000001.json",
  }]);
  const updated = applyGenerationGraphTransaction(original, accepted.transaction);
  assert.equal(updated.nodes.find((node) => node.id === "final")?.selected, selectedPath);
  assert.equal(updated.nodes.find((node) => node.id === "delivery")?.selected,
    "./products/delivery/bld_20261108T090000000Z_0000000001.json");
});

test("every demanded generated Node receives an output attempt without an export flag", async () => {
  const prepared = await prepareGenerationGraphTargets(
    project("generate"),
    link(createResolvedClosure([manifest]), []),
    host,
    ["delivery"],
  );
  assert.equal(prepared.kind, "build");
  if (prepared.kind !== "build") throw new Error("expected a Build preparation");
  assert.deepEqual(prepared.generated.map((item) => item.node), ["base", "delivery", "final"]);
  assert.deepEqual(prepared.publication.outputs.map((item) => item.name), ["base", "delivery", "final"]);
});

test("an unrelated unavailable Product does not block another target branch", async () => {
  const original = project("generate");
  const unavailable = "./products/orphan/failed.json";
  const withOrphan: GenerationGraphProject = {
    ...original,
    nodes: [...original.nodes, {
      id: "orphan",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { value: "unused" } },
      products: [unavailable],
      selected: unavailable,
    }],
  };
  let resolutions = 0;
  const prepared = await prepareGenerationGraphTargets(
    withOrphan,
    link(createResolvedClosure([manifest]), []),
    {
      ...host,
      resolveProduct() {
        resolutions += 1;
        throw new Error("unavailable");
      },
    },
    ["base"],
  );
  assert.equal(prepared.kind, "build");
  assert.equal(resolutions, 0);
});
