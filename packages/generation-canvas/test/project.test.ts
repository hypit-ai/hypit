import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGenerationWorkspaceTransaction,
  createGenerationWorkspace,
  parseGenerationWorkspace,
  serializeGenerationWorkspace,
} from "../src/index.js";

test("the Workspace persists layout, exact outputs and explicit selection without observed state", () => {
  const empty = createGenerationWorkspace({
    id: "storyboard-main",
    name: "Storyboard",
    graph: { path: "storyboard.graph.json" },
  });
  const placed = applyGenerationWorkspaceTransaction(empty, {
    revision: 0,
    commands: [
      { kind: "node.add", node: { node: "hero", name: "Hero image", x: 120, y: 48 } },
      { kind: "output.attach", output: { node: "hero", build: "Build-A", output: "hero" } },
      { kind: "node.select-output", node: "hero", output: { build: "Build-A", output: "hero" } },
    ],
  });
  assert.deepEqual(placed.nodes[0]?.selected, { build: "Build-A", output: "hero" });
  assert.deepEqual(placed.outputs, [{ node: "hero", build: "Build-A", output: "hero" }]);
  assert.deepEqual(parseGenerationWorkspace(serializeGenerationWorkspace(placed)), placed);
  assert.throws(() => parseGenerationWorkspace(JSON.stringify({ ...placed, status: "ready" })),
    /must contain only format, id, name, revision, graph, packages, viewport, nodes, outputs/u);
  assert.throws(() => parseGenerationWorkspace(JSON.stringify({
    ...placed,
    nodes: [{ ...placed.nodes[0], width: 320 }],
  })), /size must provide both width and height/u);
});

test("Workspace movement and output selection share one explicit revision", () => {
  const empty = createGenerationWorkspace({ id: "main", name: "Main", graph: { path: "main.graph.json" } });
  const placed = applyGenerationWorkspaceTransaction(empty, {
    revision: 0,
    commands: [
      { kind: "node.add", node: { node: "hero", name: "Hero", x: 0, y: 0 } },
      { kind: "output.attach", output: { node: "hero", build: "Build-A", output: "hero" } },
    ],
  });
  const changed = applyGenerationWorkspaceTransaction(placed, {
    revision: 1,
    commands: [
      { kind: "node.move", node: "hero", x: 300, y: 180 },
      { kind: "node.resize", node: "hero", width: 360, height: 240 },
      { kind: "node.rename", node: "hero", name: "Opening portrait" },
      { kind: "node.select-output", node: "hero", output: { build: "Build-A", output: "hero" } },
      { kind: "viewport.set", centerX: 420, centerY: 240, zoom: 1.25 },
    ],
  });
  assert.deepEqual(changed.nodes[0], {
    node: "hero", name: "Opening portrait", x: 300, y: 180, width: 360, height: 240,
    selected: { build: "Build-A", output: "hero" },
  });
  assert.deepEqual(changed.viewport, { centerX: 420, centerY: 240, zoom: 1.25 });
  assert.throws(() => applyGenerationWorkspaceTransaction(changed, { revision: 1, commands: [] }),
    /expected revision 1, found 2/u);
  const cleared = applyGenerationWorkspaceTransaction(changed, {
    revision: 2,
    commands: [{ kind: "node.select-output", node: "hero" }],
  });
  assert.equal(cleared.nodes[0]?.selected, undefined);
  assert.deepEqual(cleared.outputs, [{ node: "hero", build: "Build-A", output: "hero" }]);
  const autoSized = applyGenerationWorkspaceTransaction(cleared, {
    revision: 3,
    commands: [{ kind: "node.resize", node: "hero" }],
  });
  assert.equal(autoSized.nodes[0]?.width, undefined);
  assert.equal(autoSized.nodes[0]?.height, undefined);
});

test("detaching a selected output clears only that author choice", () => {
  const workspace = applyGenerationWorkspaceTransaction(
    createGenerationWorkspace({ id: "main", name: "Main", graph: { path: "main.graph.json" } }),
    { revision: 0, commands: [
      { kind: "node.add", node: { node: "hero", name: "Hero", x: 0, y: 0 } },
      { kind: "output.attach", output: { node: "hero", build: "Build-A", output: "hero" } },
      { kind: "node.select-output", node: "hero", output: { build: "Build-A", output: "hero" } },
    ] },
  );
  const detached = applyGenerationWorkspaceTransaction(workspace, {
    revision: 1,
    commands: [{ kind: "output.detach", output: { build: "Build-A", output: "hero" } }],
  });
  assert.equal(detached.nodes[0]?.selected, undefined);
  assert.deepEqual(detached.outputs, []);
});
