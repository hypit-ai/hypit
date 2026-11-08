import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGenerationGraphTransaction,
  createGenerationGraphProject,
  parseGenerationGraphProject,
  parseGenerationNodeProduct,
  serializeGenerationGraphProject,
  type GenerationGraphNode,
} from "../src/index.js";

const component = {
  module: { name: "@example/image", version: "1" },
  name: "generate",
} as const;

function node(id: string): GenerationGraphNode {
  return {
    id,
    using: component,
    inputs: { prompt: { value: `prompt for ${id}` } },
    products: [],
    selected: "generate",
  };
}

test("the project keeps recipes, lightweight Product paths and Canvas layout as separate facts", () => {
  const empty = createGenerationGraphProject({ id: "storyboard", name: "Storyboard" });
  const edited = applyGenerationGraphTransaction(empty, {
    revision: 0,
    commands: [
      { kind: "node.add", node: node("hero") },
      { kind: "node.product.add", id: "hero", path: "./products/hero/take-001.json" },
      { kind: "node.select", id: "hero", selected: "./products/hero/take-001.json" },
      { kind: "node.position", position: { node: "hero", x: 120, y: 48 } },
    ],
  });

  assert.equal(edited.revision, 1);
  assert.equal(edited.nodes[0]?.selected, "./products/hero/take-001.json");
  assert.deepEqual(edited.layout, [{ node: "hero", x: 120, y: 48 }]);
  assert.deepEqual(parseGenerationGraphProject(serializeGenerationGraphProject(edited)), edited);
});

test("a node Product file is only one Build output pointer", () => {
  assert.deepEqual(parseGenerationNodeProduct(JSON.stringify({
    format: "hypit.node-product@1",
    build: "bld_fixture",
    output: "hero",
  })), {
    format: "hypit.node-product@1",
    build: "bld_fixture",
    output: "hero",
  });
  assert.throws(() => parseGenerationNodeProduct(JSON.stringify({
    format: "hypit.node-product@1",
    build: "bld_fixture",
    output: "hero",
    status: "failed",
  })), /must contain only/u);
});

test("removing a selected Product requires an explicit selection change in the same transaction", () => {
  const product = "./products/hero/take-001.json";
  const base = applyGenerationGraphTransaction(
    createGenerationGraphProject({ id: "selection", name: "Selection" }),
    { revision: 0, commands: [
      { kind: "node.add", node: { ...node("hero"), products: [product], selected: product } },
    ] },
  );

  assert.throws(() => applyGenerationGraphTransaction(base, {
    revision: 1,
    commands: [{ kind: "node.product.remove", id: "hero", path: product }],
  }), /Select generate or another Product/u);

  const changed = applyGenerationGraphTransaction(base, {
    revision: 1,
    commands: [
      { kind: "node.select", id: "hero", selected: "generate" },
      { kind: "node.product.remove", id: "hero", path: product },
    ],
  });
  assert.equal(changed.nodes[0]?.selected, "generate");
  assert.deepEqual(changed.nodes[0]?.products, []);
});

test("node dependencies remain an ordinary acyclic recipe even when a Product is selected", () => {
  const left = node("left");
  const right: GenerationGraphNode = {
    ...node("right"),
    inputs: { prompt: { node: "left" } },
  };
  const project = applyGenerationGraphTransaction(
    createGenerationGraphProject({ id: "acyclic", name: "Acyclic" }),
    { revision: 0, commands: [
      { kind: "node.add", node: left },
      { kind: "node.add", node: right },
    ] },
  );
  assert.throws(() => applyGenerationGraphTransaction(project, {
    revision: 1,
    commands: [{ kind: "node.replace", node: {
      ...left,
      inputs: { prompt: { node: "right" } },
    } }],
  }), /contains a cycle/u);
});
