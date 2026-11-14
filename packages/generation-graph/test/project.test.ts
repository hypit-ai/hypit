import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGenerationGraphTransaction,
  createGenerationGraphProject,
  parseGenerationGraphProject,
  serializeGenerationGraphProject,
  type GenerationGraphNode,
} from "../src/index.js";

const component = {
  module: { name: "@example/image" },
  name: "generate",
} as const;

function node(id: string): GenerationGraphNode {
  return {
    id,
    using: component,
    inputs: { prompt: { value: `prompt for ${id}` } },
  };
}

test("the project keeps only reusable recipes", () => {
  const empty = createGenerationGraphProject({ id: "storyboard", name: "Storyboard" });
  const edited = applyGenerationGraphTransaction(empty, {
    revision: 0,
    commands: [{ kind: "node.add", node: node("hero") }],
  });

  assert.equal(edited.revision, 1);
  assert.deepEqual(edited.nodes, [node("hero")]);
  assert.deepEqual(parseGenerationGraphProject(serializeGenerationGraphProject(edited)), edited);
});

test("runtime products and selections are not valid author-node fields", () => {
  assert.throws(() => parseGenerationGraphProject(JSON.stringify({
    format: "hypit.generation-graph@1",
    id: "storyboard",
    name: "Storyboard",
    revision: 0,
    nodes: [{
      ...node("hero"),
      products: ["./products/hero/take.json"],
      selected: "./products/hero/take.json",
    }],
  })), /must contain only id, using and inputs/u);
});

test("node dependencies remain an ordinary acyclic recipe", () => {
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
