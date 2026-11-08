import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGenerationCanvasTransaction,
  createGenerationCanvasView,
  parseGenerationCanvasView,
  serializeGenerationCanvasView,
} from "../src/index.js";

test("the Canvas persists graph nodes and exact Build outputs without runtime state", () => {
  const empty = createGenerationCanvasView({
    id: "storyboard-main",
    name: "Storyboard",
    graph: { path: "storyboard.graph.json" },
  });
  const placed = applyGenerationCanvasTransaction(empty, {
    revision: 0,
    commands: [
      { kind: "item.add", item: {
        id: "node-hero",
        subject: { kind: "graph-node", node: "hero" },
        x: 120,
        y: 48,
      } },
      { kind: "item.add", item: {
        id: "result-build-a-hero",
        subject: { kind: "build-output", build: "Build-A", output: "hero" },
        x: 120,
        y: 300,
      } },
    ],
  });

  assert.equal(placed.revision, 1);
  assert.deepEqual(parseGenerationCanvasView(serializeGenerationCanvasView(placed)), placed);
  assert.throws(() => parseGenerationCanvasView(JSON.stringify({
    ...placed,
    items: [{ ...placed.items[1], status: "ready" }],
  })), /must contain only id, subject, x, y/u);
});

test("Canvas edits have an independent revision", () => {
  const empty = createGenerationCanvasView({
    id: "storyboard-main",
    name: "Storyboard",
    graph: { path: "storyboard.graph.json" },
  });
  const placed = applyGenerationCanvasTransaction(empty, {
    revision: 0,
    commands: [{ kind: "item.add", item: {
      id: "node-hero",
      subject: { kind: "graph-node", node: "hero" },
      x: 0,
      y: 0,
    } }],
  });
  const moved = applyGenerationCanvasTransaction(placed, {
    revision: 1,
    commands: [{ kind: "item.move", id: "node-hero", x: 300, y: 180 }],
  });

  assert.equal(moved.revision, 2);
  assert.deepEqual(moved.items[0], {
    id: "node-hero",
    subject: { kind: "graph-node", node: "hero" },
    x: 300,
    y: 180,
  });
  assert.throws(() => applyGenerationCanvasTransaction(moved, {
    revision: 1,
    commands: [],
  }), /expected revision 1, found 2/u);
});
